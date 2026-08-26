import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const TABLE_KEYS: Record<string, string[][]> = {
  messages: [["messages"], ["conversations"]],
  conversations: [["conversations"]],
  conversation_members: [["conversations"]],
  message_reactions: [["reactions"], ["conversations"]],
  message_receipts: [["receipts"], ["conversations"]],
  profiles: [["conversations"], ["contacts"], ["my-profile"]],
  contacts: [["contacts"], ["conversations"]],
  invites: [["invites"], ["contacts"]],
  blocked_users: [["blocked"], ["conversations"]],
  avatar_photos: [["gallery-glow"], ["avatar-photos"]],
  avatar_photo_views: [["gallery-glow"]],
  avatar_photo_reactions: [["avatar-photo-reactions"], ["photo-reaction-alerts"]],
};

/** Keeps every cached list in sync with the database in real time. */
export function useRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase.channel("realtime-sync");
    const pendingKeys = new Map<string, string[]>();
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      flushTimer = null;
      const keys = [...pendingKeys.values()];
      pendingKeys.clear();
      for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
    };

    const queueInvalidation = (keys: string[][]) => {
      for (const queryKey of keys) pendingKeys.set(JSON.stringify(queryKey), queryKey);
      if (!flushTimer) flushTimer = setTimeout(flush, 250);
    };

    for (const [table, keys] of Object.entries(TABLE_KEYS)) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        queueInvalidation(keys);
      });
    }

    channel.subscribe();

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      queueInvalidation([
        ["conversations"],
        ["messages"],
        ["reactions"],
        ["receipts"],
        ["gallery-glow"],
        ["photo-reaction-alerts"],
      ]);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (flushTimer) clearTimeout(flushTimer);
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
