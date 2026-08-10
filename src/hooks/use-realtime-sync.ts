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
};

/** Keeps every cached list in sync with the database in real time. */
export function useRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase.channel("realtime-sync");

    for (const [table, keys] of Object.entries(TABLE_KEYS)) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
      });
    }

    channel.subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible") void queryClient.invalidateQueries();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
