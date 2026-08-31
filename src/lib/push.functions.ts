import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BUILTIN_SOUNDS, CUSTOM_SOUND_ID } from "@/lib/notification-sounds";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1000),
  p256dh: z.string().min(10).max(500),
  auth: z.string().min(4).max(500),
  userAgent: z.string().max(300).optional(),
});

export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => subscriptionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("push_subscriptions").upsert(
      {
        user_id: context.userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        user_agent: data.userAgent ?? null,
      },
      { onConflict: "endpoint" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ endpoint: z.string().max(1000) }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", data.endpoint)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const notifySchema = z.object({
  conversationId: z.string().uuid(),
  kind: z.enum(["message", "reaction"]),
  preview: z.string().max(160).default(""),
  emoji: z.string().max(12).optional(),
  targetUserId: z.string().uuid().optional(),
});

export const notifyConversationEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => notifySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // RLS garante que apenas membros da conversa conseguem listar os participantes.
    const { data: members, error: membersError } = await supabase
      .from("conversation_members")
      .select("user_id")
      .eq("conversation_id", data.conversationId);
    if (membersError) throw new Error(membersError.message);

    let recipients = (members ?? []).map((m) => m.user_id).filter((id) => id !== userId);
    if (data.targetUserId) recipients = recipients.filter((id) => id === data.targetUserId);
    if (recipients.length === 0) return { sent: 0 };

    const { data: conversation } = await supabase
      .from("conversations")
      .select("id, is_group, name")
      .eq("id", data.conversationId)
      .maybeSingle();

    const { data: senderProfile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle();
    const senderName = senderProfile?.display_name?.trim() || "Alguém";

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: blocks }, { data: settingsRows }, { data: subscriptions }] = await Promise.all([
      supabaseAdmin.from("blocked_users").select("blocker_id").eq("blocked_id", userId).in("blocker_id", recipients),
      supabaseAdmin
        .from("notification_settings")
        .select(
          "user_id, push_enabled, notify_reactions, message_sound, reaction_sound, custom_sound_path, sound_enabled, banner_messages, banner_reactions, sound_messages, sound_reactions",
        )
        .in("user_id", recipients),
      supabaseAdmin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", recipients),
    ]);

    const blockedBy = new Set((blocks ?? []).map((row) => row.blocker_id));
    const settingsByUser = new Map((settingsRows ?? []).map((row) => [row.user_id, row]));

    const { sendWebPush } = await import("@/lib/push.server");
    const isGroup = Boolean(conversation?.is_group);
    const groupName = conversation?.name?.trim() || "Grupo";
    const url = `/conversas?c=${data.conversationId}`;

    let sent = 0;
    const stale: string[] = [];

    for (const sub of subscriptions ?? []) {
      if (blockedBy.has(sub.user_id)) continue;
      const settings = settingsByUser.get(sub.user_id);
      if (!settings?.push_enabled) continue;
      if (data.kind === "reaction" && !settings.notify_reactions) continue;

      const soundId = data.kind === "reaction" ? settings.reaction_sound : settings.message_sound;
      let soundUrl: string | null = BUILTIN_SOUNDS.find((s) => s.id === soundId)?.url ?? null;
      if (soundId === CUSTOM_SOUND_ID && settings.custom_sound_path) {
        const { data: signed } = await supabaseAdmin.storage
          .from("notification-sounds")
          .createSignedUrl(settings.custom_sound_path, 60 * 60 * 12);
        soundUrl = signed?.signedUrl ?? soundUrl;
      }

      const title = data.kind === "reaction" ? "Nova reação" : isGroup ? groupName : senderName;
      const body =
        data.kind === "reaction"
          ? `${senderName} reagiu ${data.emoji ?? "❤️"} à sua mensagem`
          : isGroup
            ? `${senderName}: ${data.preview || "enviou uma mensagem"}`
            : data.preview || "enviou uma mensagem";

      try {
        const status = await sendWebPush(sub, {
          title,
          body,
          url,
          tag: `${data.kind}-${data.conversationId}`,
          kind: data.kind,
          soundUrl,
        });
        if (status === 404 || status === 410) stale.push(sub.id);
        else if (status < 300) sent += 1;
      } catch (error) {
        console.error("push failed", error);
      }
    }

    if (stale.length > 0) {
      await supabaseAdmin.from("push_subscriptions").delete().in("id", stale);
    }

    return { sent };
  });
