import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Archive, ArchiveRestore, ArrowDown, ArrowLeft, Ban, MessageSquare, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  blockUser,
  conversationAvatarPath,
  conversationTitle,
  deleteMessage,
  leaveConversation,
  listBlockedIds,
  listConversations,
  listMessages,
  listReactions,
  listReceipts,
  type MessageReaction,
  markConversationRead,
  markMessagesDelivered,
  messagePreview,
  requireUserId,
  sendMediaMessage,
  sendTextMessage,
  setConversationArchived,
  toggleReaction,
  type ConversationWithPeople,
} from "@/lib/chat";
import { usePresence } from "@/hooks/use-presence";
import { AppShell } from "@/components/app-shell";
import { UserAvatar } from "@/components/user-avatar";
import { Composer } from "@/components/chat/composer";
import { MessageItem } from "@/components/chat/message-item";
import { GroupSettingsDialog } from "@/components/chat/group-settings-dialog";
import { NewConversationDialog, NewGroupDialog } from "@/components/chat/new-conversation-dialog";
import { PhotoReactionAlerts } from "@/components/photo-reaction-alerts";
import { NewPhotoAlerts } from "@/components/new-photo-alerts";
import { EnableNotificationsBanner } from "@/components/enable-notifications-banner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const EMPTY_REACTIONS: MessageReaction[] = [];

function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Hoje";
  if (date.toDateString() === yesterday.toDateString()) return "Ontem";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}


export const Route = createFileRoute("/_authenticated/conversas")({
  head: () => ({
    meta: [
      { title: "Suas conversas — Zap Tri" },
      { name: "description", content: "Envie textos, fotos, vídeos e áudios em conversas individuais e grupos." },
      { property: "og:title", content: "Suas conversas — Zap Tri" },
      { property: "og:description", content: "Mensagens em tempo real com contatos e grupos." },
    ],
  }),
  validateSearch: z.object({ c: z.string().optional() }),
  component: ConversationsPage,
});

function ConversationsPage() {
  const { c: activeId } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const [menuConversation, setMenuConversation] = useState<ConversationWithPeople | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);

  const { data: myId } = useQuery({ queryKey: ["my-id"], queryFn: requireUserId, staleTime: Infinity });
  const onlineIds = usePresence(myId);
  const { data: allConversations = [], isLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: listConversations,
    staleTime: 10 * 1000,
  });
  const { data: blockedIds = [] } = useQuery({
    queryKey: ["blocked"],
    queryFn: listBlockedIds,
    staleTime: 60 * 1000,
  });

  const visibleConversations = useMemo(
    () =>
      allConversations.filter(
        (conversation) =>
          conversation.is_group ||
          !conversation.members.some((member) => member.id !== myId && blockedIds.includes(member.id)),
      ),
    [allConversations, blockedIds, myId],
  );

  const conversations = useMemo(
    () => visibleConversations.filter((conversation) => conversation.is_archived === showArchived),
    [visibleConversations, showArchived],
  );
  const archivedCount = visibleConversations.filter((conversation) => conversation.is_archived).length;

  const active = useMemo(
    () => visibleConversations.find((conversation) => conversation.id === activeId) ?? null,
    [visibleConversations, activeId],
  );

  const { data: messages = [] } = useQuery({
    queryKey: ["messages", activeId],
    queryFn: () => listMessages(activeId as string),
    enabled: Boolean(activeId),
    staleTime: 10 * 1000,
  });

  const { data: reactions = [] } = useQuery({
    queryKey: ["reactions", activeId],
    queryFn: () => listReactions(activeId as string),
    enabled: Boolean(activeId),
    staleTime: 10 * 1000,
  });

  const { data: receipts = [] } = useQuery({
    queryKey: ["receipts", activeId],
    queryFn: () => listReceipts(activeId as string),
    enabled: Boolean(activeId),
    staleTime: 10 * 1000,
  });

  const reactionsByMessage = useMemo(() => {
    const grouped = new Map<string, MessageReaction[]>();
    for (const reaction of reactions) {
      const list = grouped.get(reaction.message_id) ?? [];
      list.push(reaction);
      grouped.set(reaction.message_id, list);
    }
    return grouped;
  }, [reactions]);

  const nameById = useMemo(
    () => Object.fromEntries((active?.members ?? []).map((member) => [member.id, member.display_name])),
    [active?.members],
  );

  const readByMe = useMemo(
    () => new Set(receipts.filter((receipt) => receipt.user_id === myId && receipt.read_at).map((receipt) => receipt.message_id)),
    [receipts, myId],
  );
  const unreadMessages = useMemo(
    () => messages.filter((message) => message.sender_id !== myId && !readByMe.has(message.id)),
    [messages, readByMe, myId],
  );
  const firstUnreadMessageId = unreadMessages[0]?.id;
  const unreadCount = unreadMessages.length;

  // Marca como lida apenas uma vez por conversa/última mensagem — evita loop de
  // escrita → evento em tempo real → recarga → escrita, que travava a tela.
  const readMarkRef = useRef<string | null>(null);
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1]?.id : undefined;

  useEffect(() => {
    if (!activeId || !myId || !lastMessageId) return;
    const mark = `${activeId}:${lastMessageId}`;
    if (readMarkRef.current === mark) return;
    readMarkRef.current = mark;
    void markConversationRead(activeId).then(() => {
      void queryClient.invalidateQueries({ queryKey: ["receipts", activeId] });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    });
  }, [activeId, myId, lastMessageId, queryClient]);

  const deliveredRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!myId) return;
    const pending = allConversations
      .filter((conversation) => conversation.id !== activeId)
      .map((conversation) => conversation.lastMessage)
      .filter((message) => message && message.sender_id !== myId)
      .map((message) => message!.id)
      .filter((id) => !deliveredRef.current.has(id));
    if (pending.length === 0) return;
    for (const id of pending) deliveredRef.current.add(id);
    void markMessagesDelivered(pending);
  }, [allConversations, activeId, myId]);


  function ownStatus(messageId: string): "sent" | "delivered" | "read" {
    const others = (active?.members ?? []).filter((member) => member.id !== myId).length;
    const list = receipts.filter((receipt) => receipt.message_id === messageId);
    if (others > 0 && list.filter((receipt) => receipt.read_at).length >= others) return "read";
    if (list.length > 0) return "delivered";
    return "sent";
  }


  // Sincronização em tempo real é feita globalmente em useRealtimeSync (AppShell).


  useEffect(() => {
    if (!firstUnreadMessageId) {
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
  }, [messages.length, activeId, firstUnreadMessageId]);

  const removeMessage = useMutation({
    mutationFn: deleteMessage,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["messages", activeId] });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reactMutation = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      toggleReaction(messageId, emoji),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reactions", activeId] });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleReact = useCallback(
    (messageId: string, emoji: string) => reactMutation.mutate({ messageId, emoji }),
    [reactMutation],
  );

  const handleDelete = useCallback((id: string) => removeMessage.mutate(id), [removeMessage]);

  const archiveMutation = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      setConversationArchived(id, archived),
    onSuccess: (_data, variables) => {
      setMenuConversation(null);
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast.success(variables.archived ? "Conversa arquivada" : "Conversa desarquivada");
      if (variables.id === activeId) void navigate({ to: "/conversas", search: {} });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteConversation = useMutation({
    mutationFn: leaveConversation,
    onSuccess: (_data, id) => {
      setMenuConversation(null);
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Conversa excluída");
      if (id === activeId) void navigate({ to: "/conversas", search: {} });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const blockMutation = useMutation({
    mutationFn: async (conversation: ConversationWithPeople) => {
      const other = conversation.members.find((member) => member.id !== myId);
      if (!other) throw new Error("Contato não encontrado");
      await blockUser(other.id);
    },
    onSuccess: (_data, conversation) => {
      setMenuConversation(null);
      void queryClient.invalidateQueries({ queryKey: ["blocked"] });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Contato bloqueado");
      if (conversation.id === activeId) void navigate({ to: "/conversas", search: {} });
    },
    onError: (error: Error) => toast.error(error.message),
  });


  function startPress(conversation: ConversationWithPeople) {
    longPressed.current = false;
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      setMenuConversation(conversation);
    }, 2000);
  }

  function endPress() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }

  function openConversation(id: string) {
    void navigate({ to: "/conversas", search: { c: id } });
  }

  return (
    <AppShell>
      <div className="flex h-full min-h-0 flex-1">
        <section
          className={cn(
            "flex w-full flex-col border-r border-border md:flex md:w-80",
            activeId ? "hidden md:flex" : "flex",
          )}
        >
          <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h1 className="font-display text-lg font-bold">
              {showArchived ? "Arquivadas" : "Conversas"}
            </h1>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                aria-label={showArchived ? "Ver conversas" : "Ver arquivadas"}
                onClick={() => setShowArchived((value) => !value)}
              >
                {showArchived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
              </Button>
              <NewGroupDialog onOpened={openConversation} />
              <NewConversationDialog onOpened={openConversation} />
            </div>
          </header>

          {!showArchived && archivedCount > 0 ? (
            <button
              onClick={() => setShowArchived(true)}
              className="border-b border-border/60 px-4 py-2 text-left text-xs text-muted-foreground hover:bg-muted"
            >
              {archivedCount} conversa(s) arquivada(s)
            </button>
          ) : null}

          <EnableNotificationsBanner />

          <NewPhotoAlerts />

          <PhotoReactionAlerts />

          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Carregando…</p>
            ) : conversations.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                {showArchived
                  ? "Nenhuma conversa arquivada."
                  : "Nenhuma conversa ainda. Toque em “Nova” para começar."}
              </p>
            ) : (
              conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  onClick={() => {
                    if (longPressed.current) {
                      longPressed.current = false;
                      return;
                    }
                    openConversation(conversation.id);
                  }}
                  onPointerDown={() => startPress(conversation)}
                  onPointerUp={endPress}
                  onPointerLeave={endPress}
                  onPointerCancel={endPress}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setMenuConversation(conversation);
                  }}
                  className={cn(
                    "flex w-full select-none items-center gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors hover:bg-muted",
                    conversation.id === activeId && "bg-muted",
                  )}
                >
                  <div className="relative shrink-0">
                    <UserAvatar
                      userId={
                        conversation.is_group
                          ? undefined
                          : conversation.members.find((m) => m.id !== myId)?.id
                      }
                      path={conversationAvatarPath(conversation, myId ?? "")}
                      name={conversationTitle(conversation, myId ?? "")}
                      online={
                        !conversation.is_group &&
                        conversation.members.some((m) => m.id !== myId && onlineIds.has(m.id))
                      }
                    />
                    {conversation.unreadCount > 0 ? (
                      <span className="absolute -right-2 -top-2 z-20 inline-flex h-4 min-w-4 items-center justify-center rounded-full rounded-bl-[3px] bg-destructive px-1 text-[9px] font-bold leading-none text-destructive-foreground shadow-lg ring-1 ring-background">
                        {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
                      </span>
                    ) : null}
                  </div>


                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {conversationTitle(conversation, myId ?? "")}
                    </p>
                    {!conversation.is_group ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {conversation.members.find((m) => m.id !== myId)?.email ?? ""}
                      </p>
                    ) : null}
                    <p className="truncate text-xs text-muted-foreground">
                      {conversation.is_group && conversation.lastMessage
                        ? `${
                            conversation.lastMessage.sender_id === myId
                              ? "Você"
                              : conversation.members.find(
                                  (m) => m.id === conversation.lastMessage?.sender_id,
                                )?.display_name ?? "Alguém"
                          }: ${messagePreview(conversation.lastMessage)}`
                        : messagePreview(conversation.lastMessage)}
                    </p>
                    {conversation.lastReaction ? (
                      <p className="truncate text-xs text-muted-foreground">
                        <span className="mr-1">{conversation.lastReaction.emoji}</span>
                        {conversation.lastReaction.user_id === myId
                          ? "Você reagiu"
                          : `${
                              conversation.members.find(
                                (m) => m.id === conversation.lastReaction?.user_id,
                              )?.display_name ?? "Alguém"
                            } reagiu`}
                      </p>
                    ) : null}
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        <Dialog
          open={Boolean(menuConversation)}
          onOpenChange={(open) => !open && setMenuConversation(null)}
        >
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle>
                {menuConversation ? conversationTitle(menuConversation, myId ?? "") : ""}
              </DialogTitle>
              <DialogDescription>O que você quer fazer com esta conversa?</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Button
                variant="secondary"
                className="justify-start"
                disabled={archiveMutation.isPending}
                onClick={() =>
                  menuConversation &&
                  archiveMutation.mutate({
                    id: menuConversation.id,
                    archived: !menuConversation.is_archived,
                  })
                }
              >
                {menuConversation?.is_archived ? (
                  <>
                    <ArchiveRestore className="mr-2 size-4" /> Desarquivar conversa
                  </>
                ) : (
                  <>
                    <Archive className="mr-2 size-4" /> Arquivar conversa
                  </>
                )}
              </Button>
              {menuConversation && !menuConversation.is_group ? (
                <Button
                  variant="outline"
                  className="justify-start"
                  disabled={blockMutation.isPending}
                  onClick={() => blockMutation.mutate(menuConversation)}
                >
                  <Ban className="mr-2 size-4 text-destructive" /> Bloquear contato
                </Button>
              ) : null}
              <Button
                variant="destructive"
                className="justify-start"
                disabled={deleteConversation.isPending}
                onClick={() => menuConversation && deleteConversation.mutate(menuConversation.id)}
              >
                <Trash2 className="mr-2 size-4" /> Excluir conversa
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <GroupSettingsDialog
          key={active?.id ?? "none"}
          conversation={active?.is_group ? active : null}
          myId={myId ?? ""}
          open={groupSettingsOpen}
          onOpenChange={setGroupSettingsOpen}
        />

        <section className={cn("flex min-w-0 flex-1 flex-col", activeId ? "flex" : "hidden md:flex")}>
          {active ? (
            <>
              <header className="flex items-center gap-3 border-b border-border px-4 py-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label="Voltar"
                  onClick={() => void navigate({ to: "/conversas", search: {} })}
                >
                  <ArrowLeft className="size-4" />
                </Button>
                {active.is_group ? (
                  <button
                    type="button"
                    aria-label="Configurações do grupo"
                    className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => setGroupSettingsOpen(true)}
                  >
                    <UserAvatar path={active.avatar_url} name={active.name} className="size-9" />
                  </button>
                ) : (
                  <UserAvatar
                    userId={active.members.find((m) => m.id !== myId)?.id}
                    path={conversationAvatarPath(active, myId ?? "")}
                    name={conversationTitle(active, myId ?? "")}
                    className="size-9"
                    online={active.members.some((m) => m.id !== myId && onlineIds.has(m.id))}
                  />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{conversationTitle(active, myId ?? "")}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {active.is_group
                      ? `${active.members.length} participantes · toque na foto para configurar`
                      : active.members.some((m) => m.id !== myId && onlineIds.has(m.id))
                        ? "Online"
                        : active.members.find((m) => m.id !== myId)?.email || "Conversa individual"}
                  </p>
                </div>
              </header>


              <div className="flex-1 space-y-2 overflow-y-auto bg-chat-canvas p-4">
                {messages.map((message, index) => {
                  const sender = active.members.find((member) => member.id === message.sender_id);
                  const previous = index > 0 ? messages[index - 1] : undefined;
                  const showDate =
                    !previous ||
                    new Date(previous.created_at).toDateString() !==
                      new Date(message.created_at).toDateString();
                  return (
                    <div key={message.id} className="space-y-2">
                      {showDate ? (
                        <div className="flex items-center justify-center py-2">
                          <span className="rounded-full border border-border bg-background/80 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground shadow-sm">
                            {dayLabel(message.created_at)}
                          </span>
                        </div>
                      ) : null}
                      <MessageItem
                        message={message}
                        isOwn={message.sender_id === myId}
                        senderName={sender?.display_name ?? "Alguém"}
                        senderAvatar={sender?.avatar_url}
                        showSender={active.is_group}
                        status={message.sender_id === myId ? ownStatus(message.id) : undefined}
                        reactions={reactionsByMessage.get(message.id) ?? EMPTY_REACTIONS}
                        myId={myId ?? ""}
                        nameById={nameById}
                        onReact={handleReact}
                        onDelete={handleDelete}
                      />
                    </div>
                  );
                })}

                <div ref={bottomRef} />
              </div>

              <Composer
                onSendText={async (body) => {
                  await sendTextMessage(active.id, body);
                  void queryClient.invalidateQueries({ queryKey: ["messages", active.id] });
                }}
                onSendMedia={async (input) => {
                  await sendMediaMessage({ conversationId: active.id, ...input });
                  void queryClient.invalidateQueries({ queryKey: ["messages", active.id] });
                }}
              />
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-chat-canvas p-8 text-center">
              <MessageSquare className="size-10 text-primary" />
              <p className="font-display text-lg font-semibold">Escolha uma conversa</p>
              <p className="max-w-xs text-sm text-muted-foreground">
                Selecione um chat à esquerda ou convide alguém pelos contatos.
              </p>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
