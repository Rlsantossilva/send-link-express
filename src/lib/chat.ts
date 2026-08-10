import { supabase } from "@/integrations/supabase/client";
import { lookupProfile, type PublicProfileLookup } from "@/lib/profiles.functions";
import { answerInvite } from "@/lib/invites.functions";
import { notifyConversationEvent } from "@/lib/push.functions";

/** Dispara as notificações push sem travar o envio da mensagem. */
function fireNotification(input: {
  conversationId: string;
  kind: "message" | "reaction";
  preview?: string;
  emoji?: string;
  targetUserId?: string;
}) {
  void notifyConversationEvent({
    data: {
      conversationId: input.conversationId,
      kind: input.kind,
      preview: (input.preview ?? "").slice(0, 160),
      ...(input.emoji ? { emoji: input.emoji } : {}),
      ...(input.targetUserId ? { targetUserId: input.targetUserId } : {}),
    },
  }).catch(() => undefined);
}



export type Profile = {
  id: string;
  display_name: string;
  phone: string | null;
  avatar_url: string | null;
  status_text: string | null;
  email: string | null;
};

export type MessageKind = "text" | "image" | "video" | "audio";

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  kind: MessageKind;
  body: string | null;
  media_path: string | null;
  media_name: string | null;
  duration_seconds: number | null;
  created_at: string;
};

export type Conversation = {
  id: string;
  is_group: boolean;
  name: string | null;
  avatar_url: string | null;
  created_by: string;
  last_message_at: string;
};

export type ConversationWithPeople = Conversation & {
  members: Profile[];
  lastMessage: Message | null;
  is_archived: boolean;
  lastReaction: { emoji: string; user_id: string } | null;
  unreadCount: number;
};

export type MessageReaction = {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
};

export type Contact = {
  id: string;
  contact_id: string;
  nickname: string | null;
  profile: Profile | null;
};

export type Invite = {
  id: string;
  inviter_id: string;
  invitee_email: string | null;
  invitee_phone: string | null;
  invitee_id: string | null;
  message: string | null;
  status: "pending" | "accepted" | "declined";
  created_at: string;
};

export async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sessão expirada");
  return data.user.id;
}

export async function getMyProfile(): Promise<Profile | null> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, phone, avatar_url, status_text, email")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateMyProfile(patch: Partial<Profile>) {
  const userId = await requireUserId();
  const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
  if (error) throw error;
}

export async function listConversations(): Promise<ConversationWithPeople[]> {
  const userId = await requireUserId();

  const { data: myMemberships, error: memberErr } = await supabase
    .from("conversation_members")
    .select("conversation_id, is_archived")
    .eq("user_id", userId);
  if (memberErr) throw memberErr;

  const ids = (myMemberships ?? []).map((m) => m.conversation_id);
  const archivedById = new Map((myMemberships ?? []).map((m) => [m.conversation_id, m.is_archived]));
  if (ids.length === 0) return [];

  const [convRes, membersRes, messagesRes] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, is_group, name, avatar_url, created_by, last_message_at")
      .in("id", ids)
      .order("last_message_at", { ascending: false }),
    supabase
      .from("conversation_members")
      .select("conversation_id, user_id")
      .in("conversation_id", ids),
    supabase
      .from("messages")
      .select("*")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false }),
  ]);

  if (convRes.error) throw convRes.error;
  if (membersRes.error) throw membersRes.error;
  if (messagesRes.error) throw messagesRes.error;

  const memberUserIds = [...new Set((membersRes.data ?? []).map((row) => row.user_id))];
  const { data: memberProfiles, error: profilesError } = memberUserIds.length
    ? await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, status_text, email")
        .in("id", memberUserIds)
    : { data: [], error: null };
  if (profilesError) throw profilesError;

  const profilesById = new Map(
    (memberProfiles ?? []).map((profile) => [profile.id, { ...profile, phone: null } as Profile]),
  );
  const membersByConv = new Map<string, Profile[]>();
  for (const row of membersRes.data ?? []) {
    const profile = profilesById.get(row.user_id);
    if (!profile) continue;
    const list = membersByConv.get(row.conversation_id) ?? [];
    list.push(profile);
    membersByConv.set(row.conversation_id, list);
  }

  const allMessages = (messagesRes.data ?? []) as Message[];
  const lastByConv = new Map<string, Message>();
  for (const msg of allMessages) {
    if (!lastByConv.has(msg.conversation_id)) lastByConv.set(msg.conversation_id, msg);
  }

  const messageIds = allMessages.map((msg) => msg.id);
  const convByMessage = new Map(allMessages.map((msg) => [msg.id, msg.conversation_id]));

  const [reactionsRes, receiptsRes] = await Promise.all([
    messageIds.length
      ? supabase
          .from("message_reactions")
          .select("message_id, user_id, emoji, created_at")
          .in("message_id", messageIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    messageIds.length
      ? supabase
          .from("message_receipts")
          .select("message_id, read_at")
          .eq("user_id", userId)
          .in("message_id", messageIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (reactionsRes.error) throw reactionsRes.error;
  if (receiptsRes.error) throw receiptsRes.error;

  const lastReactionByConv = new Map<string, { emoji: string; user_id: string }>();
  for (const reaction of reactionsRes.data ?? []) {
    const convId = convByMessage.get(reaction.message_id);
    if (!convId || lastReactionByConv.has(convId)) continue;
    lastReactionByConv.set(convId, { emoji: reaction.emoji, user_id: reaction.user_id });
  }

  const readIds = new Set(
    (receiptsRes.data ?? []).filter((row) => row.read_at).map((row) => row.message_id),
  );
  const unreadByConv = new Map<string, number>();
  for (const msg of allMessages) {
    if (msg.sender_id === userId || readIds.has(msg.id)) continue;
    unreadByConv.set(msg.conversation_id, (unreadByConv.get(msg.conversation_id) ?? 0) + 1);
  }

  return ((convRes.data ?? []) as Conversation[]).map((conv) => ({
    ...conv,
    members: membersByConv.get(conv.id) ?? [],
    lastMessage: lastByConv.get(conv.id) ?? null,
    is_archived: archivedById.get(conv.id) ?? false,
    lastReaction: lastReactionByConv.get(conv.id) ?? null,
    unreadCount: unreadByConv.get(conv.id) ?? 0,
  }));
}

export async function setConversationArchived(conversationId: string, archived: boolean) {
  const userId = await requireUserId();
  const { error } = await supabase
    .from("conversation_members")
    .update({ is_archived: archived })
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function leaveConversation(conversationId: string) {
  const userId = await requireUserId();
  const { error } = await supabase
    .from("conversation_members")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
  if (error) throw error;
}

export type MessageReceipt = {
  message_id: string;
  user_id: string;
  delivered_at: string;
  read_at: string | null;
};

export async function listReceipts(conversationId: string): Promise<MessageReceipt[]> {
  const { data: msgs, error: msgErr } = await supabase
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId);
  if (msgErr) throw msgErr;
  const ids = (msgs ?? []).map((m) => m.id);
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("message_receipts")
    .select("message_id, user_id, delivered_at, read_at")
    .in("message_id", ids);
  if (error) throw error;
  return (data ?? []) as MessageReceipt[];
}

export async function markConversationRead(conversationId: string) {
  const userId = await requireUserId();
  const { data: msgs, error } = await supabase
    .from("messages")
    .select("id, sender_id")
    .eq("conversation_id", conversationId);
  if (error) throw error;
  const ids = (msgs ?? []).filter((m) => m.sender_id !== userId).map((m) => m.id);
  if (ids.length === 0) return;
  const now = new Date().toISOString();
  const { error: upsertError } = await supabase
    .from("message_receipts")
    .upsert(
      ids.map((message_id) => ({ message_id, user_id: userId, delivered_at: now, read_at: now })),
      { onConflict: "message_id,user_id" },
    );
  if (upsertError) throw upsertError;
}

export async function markMessagesDelivered(messageIds: string[]) {
  if (messageIds.length === 0) return;
  const userId = await requireUserId();
  const { error } = await supabase.from("message_receipts").upsert(
    messageIds.map((message_id) => ({ message_id, user_id: userId })),
    { onConflict: "message_id,user_id", ignoreDuplicates: true },
  );
  if (error) throw error;
}

export async function listBlockedIds(): Promise<string[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("blocked_users")
    .select("blocked_id")
    .eq("blocker_id", userId);
  if (error) throw error;
  return (data ?? []).map((row) => row.blocked_id);
}

export async function blockUser(blockedId: string) {
  const userId = await requireUserId();
  const { error } = await supabase
    .from("blocked_users")
    .upsert({ blocker_id: userId, blocked_id: blockedId }, { onConflict: "blocker_id,blocked_id" });
  if (error) throw error;
}

export async function unblockUser(blockedId: string) {
  const userId = await requireUserId();
  const { error } = await supabase
    .from("blocked_users")
    .delete()
    .eq("blocker_id", userId)
    .eq("blocked_id", blockedId);
  if (error) throw error;
}

export async function updateGroupInfo(conversationId: string, patch: { name?: string; avatar_url?: string }) {
  const { error } = await supabase.from("conversations").update(patch).eq("id", conversationId);
  if (error) throw error;
}

export async function uploadGroupAvatar(conversationId: string, file: File) {
  const userId = await requireUserId();
  const extension = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const path = `${userId}/groups/${conversationId}-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("avatars").upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw error;
  await updateGroupInfo(conversationId, { avatar_url: path });
  return path;
}

export async function addGroupMembers(conversationId: string, userIds: string[]) {
  if (userIds.length === 0) return;
  const { error } = await supabase.from("conversation_members").upsert(
    userIds.map((user_id) => ({ conversation_id: conversationId, user_id, is_admin: false })),
    { onConflict: "conversation_id,user_id", ignoreDuplicates: true },
  );
  if (error) throw error;
}

export async function removeGroupMember(conversationId: string, userId: string) {
  const { error } = await supabase
    .from("conversation_members")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function listReactions(conversationId: string): Promise<MessageReaction[]> {

  const { data: msgs, error: msgErr } = await supabase
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId);
  if (msgErr) throw msgErr;
  const ids = (msgs ?? []).map((m) => m.id);
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("message_reactions")
    .select("id, message_id, user_id, emoji")
    .in("message_id", ids);
  if (error) throw error;
  return (data ?? []) as MessageReaction[];
}

export async function toggleReaction(messageId: string, emoji: string) {
  const userId = await requireUserId();
  const { data: existing, error: findError } = await supabase
    .from("message_reactions")
    .select("id")
    .eq("message_id", messageId)
    .eq("user_id", userId)
    .eq("emoji", emoji)
    .maybeSingle();
  if (findError) throw findError;

  if (existing) {
    const { error } = await supabase.from("message_reactions").delete().eq("id", existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from("message_reactions")
    .insert({ message_id: messageId, user_id: userId, emoji });
  if (error) throw error;

  const { data: message } = await supabase
    .from("messages")
    .select("conversation_id, sender_id")
    .eq("id", messageId)
    .maybeSingle();
  if (message && message.sender_id !== userId) {
    fireNotification({
      conversationId: message.conversation_id,
      kind: "reaction",
      emoji,
      targetUserId: message.sender_id,
    });
  }
}


export async function listMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Message[];
}

export async function sendTextMessage(conversationId: string, body: string) {
  const userId = await requireUserId();
  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: userId,
    kind: "text",
    body,
  });
  if (error) throw error;
}

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export async function sendMediaMessage(options: {
  conversationId: string;
  file: File | Blob;
  kind: Exclude<MessageKind, "text">;
  fileName: string;
  durationSeconds?: number;
  caption?: string;
}) {
  const userId = await requireUserId();
  if (options.file.size > MAX_UPLOAD_BYTES) {
    throw new Error("O arquivo deve ter no máximo 25 MB");
  }

  const extension = options.fileName.includes(".") ? options.fileName.split(".").pop() : "bin";
  const path = `${options.conversationId}/${userId}-${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage.from("chat-media").upload(path, options.file, {
    contentType: options.file.type || "application/octet-stream",
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { error } = await supabase.from("messages").insert({
    conversation_id: options.conversationId,
    sender_id: userId,
    kind: options.kind,
    body: options.caption?.trim() ? options.caption.trim() : null,
    media_path: path,
    media_name: options.fileName,
    duration_seconds: options.durationSeconds ?? null,
  });
  if (error) throw error;
}

export async function deleteMessage(messageId: string) {
  const { error } = await supabase.from("messages").delete().eq("id", messageId);
  if (error) throw error;
}

export async function createSignedUrl(bucket: "chat-media" | "avatars", path: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function listContacts(): Promise<Contact[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("contacts")
    .select("id, contact_id, nickname")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const contactIds = [...new Set((data ?? []).map((row) => row.contact_id))];
  const { data: profiles, error: profilesError } = contactIds.length
    ? await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, status_text, email")
        .in("id", contactIds)
    : { data: [], error: null };
  if (profilesError) throw profilesError;

  const profilesById = new Map(
    (profiles ?? []).map((profile) => [profile.id, { ...profile, phone: null } as Profile]),
  );
  return (data ?? []).map((row) => ({
    id: row.id,
    contact_id: row.contact_id,
    nickname: row.nickname,
    profile: profilesById.get(row.contact_id) ?? null,
  }));
}

export async function findProfileByEmailOrPhone(value: string): Promise<PublicProfileLookup | null> {
  const trimmed = value.trim();
  if (trimmed.length < 3) return null;
  return await lookupProfile({ data: { value: trimmed } });
}


export function normalizePhone(value: string) {
  return value.replace(/[^\d+]/g, "");
}

export async function addContact(contactUserId: string, nickname?: string) {
  const userId = await requireUserId();
  const { error } = await supabase
    .from("contacts")
    .upsert(
      { owner_id: userId, contact_id: contactUserId, nickname: nickname?.trim() || null },
      { onConflict: "owner_id,contact_id" },
    );
  if (error) throw error;
}

export async function removeContact(contactRowId: string) {
  const { error } = await supabase.from("contacts").delete().eq("id", contactRowId);
  if (error) throw error;
}

export async function createInvite(input: { email?: string; phone?: string; message?: string }) {
  const userId = await requireUserId();
  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phone ? normalizePhone(input.phone) : null;
  if (!email && !phone) throw new Error("Informe um e-mail ou telefone");

  let inviteeId: string | null = null;
  const existing = await findProfileByEmailOrPhone(email ?? phone ?? "");
  if (existing) inviteeId = existing.id;

  const { error } = await supabase.from("invites").insert({
    inviter_id: userId,
    invitee_email: email,
    invitee_phone: phone,
    invitee_id: inviteeId,
    message: input.message?.trim() || null,
  });
  if (error) throw error;
  return { alreadyOnApp: Boolean(existing), profile: existing };
}

export async function listInvites(): Promise<{ sent: Invite[]; received: Invite[] }> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("invites")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const all = (data ?? []) as Invite[];
  return {
    sent: all.filter((i) => i.inviter_id === userId),
    received: all.filter((i) => i.inviter_id !== userId),
  };
}

export async function respondToInvite(invite: Invite, accept: boolean) {
  return await answerInvite({ data: { inviteId: invite.id, accept } });
}

export async function deleteInvite(inviteId: string) {
  const { error } = await supabase.from("invites").delete().eq("id", inviteId);
  if (error) throw error;
}

export async function getOrCreateDirectConversation(otherUserId: string): Promise<string> {
  const userId = await requireUserId();

  const { data: mine, error: mineErr } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", userId);
  if (mineErr) throw mineErr;

  const myIds = (mine ?? []).map((m) => m.conversation_id);
  if (myIds.length > 0) {
    const { data: shared, error: sharedErr } = await supabase
      .from("conversation_members")
      .select("conversation_id, conversations:conversation_id(is_group)")
      .eq("user_id", otherUserId)
      .in("conversation_id", myIds);
    if (sharedErr) throw sharedErr;
    const direct = (shared ?? []).find(
      (row) => (row as unknown as { conversations: { is_group: boolean } | null }).conversations?.is_group === false,
    );
    if (direct) return direct.conversation_id;
  }

  const { data: conversation, error: convErr } = await supabase
    .from("conversations")
    .insert({ is_group: false, created_by: userId })
    .select("id")
    .single();
  if (convErr) throw convErr;

  const { error: memberErr } = await supabase.from("conversation_members").insert([
    { conversation_id: conversation.id, user_id: userId, is_admin: true },
    { conversation_id: conversation.id, user_id: otherUserId, is_admin: false },
  ]);
  if (memberErr) throw memberErr;

  return conversation.id;
}

export async function createGroupConversation(name: string, memberIds: string[]): Promise<string> {
  const userId = await requireUserId();
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Dê um nome ao grupo");
  if (memberIds.length === 0) throw new Error("Escolha pelo menos um contato");

  const { data: conversation, error } = await supabase
    .from("conversations")
    .insert({ is_group: true, name: cleanName, created_by: userId })
    .select("id")
    .single();
  if (error) throw error;

  const rows = [
    { conversation_id: conversation.id, user_id: userId, is_admin: true },
    ...memberIds.map((id) => ({ conversation_id: conversation.id, user_id: id, is_admin: false })),
  ];
  const { error: memberErr } = await supabase.from("conversation_members").insert(rows);
  if (memberErr) throw memberErr;

  return conversation.id;
}

export function conversationTitle(conversation: ConversationWithPeople, myId: string) {
  if (conversation.is_group) return conversation.name ?? "Grupo";
  const other = conversation.members.find((m) => m.id !== myId);
  return other?.display_name || other?.email || "Conversa";
}

export function conversationAvatarPath(conversation: ConversationWithPeople, myId: string) {
  if (conversation.is_group) return conversation.avatar_url;
  return conversation.members.find((m) => m.id !== myId)?.avatar_url ?? null;
}

export function messagePreview(message: Message | null) {
  if (!message) return "Nenhuma mensagem ainda";
  switch (message.kind) {
    case "image":
      return "📷 Foto";
    case "video":
      return "🎬 Vídeo";
    case "audio":
      return "🎤 Áudio";
    default:
      return message.body ?? "";
  }
}
