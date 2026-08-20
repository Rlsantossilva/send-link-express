import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  getNotificationSettings,
  playSoundUrl,
  registerPushWorker,
  resolveSoundUrl,
  startBackgroundAudio,
} from "@/lib/notifications";

/**
 * Toca o som escolhido e mostra a notificação quando chegam mensagens novas
 * ou reações — inclusive com o app em segundo plano (via service worker).
 */
export function useNotifications() {
  const navigate = useNavigate();
  const { data: settings } = useQuery({
    queryKey: ["notification-settings"],
    queryFn: getNotificationSettings,
    staleTime: 30_000,
  });
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    if (!settings?.push_enabled) return;
    void registerPushWorker();
  }, [settings?.push_enabled]);

  // Mantém o som funcionando com o app em segundo plano (após o 1º toque na tela).
  useEffect(() => {
    const start = () => {
      if (backgroundModeEnabled()) void enableBackgroundMode().catch(() => undefined);
      else startBackgroundAudio();
    };
    window.addEventListener("pointerdown", start, { once: true });
    window.addEventListener("keydown", start, { once: true });
    return () => {
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
    };
  }, []);

  // Sons quando o app está aberto (o service worker cuida do resto).
  useEffect(() => {
    let myId: string | null = null;
    let cancelled = false;

    const play = async (kind: "message" | "reaction") => {
      const current = settingsRef.current;
      if (!current?.sound_enabled) return;
      if (kind === "reaction" && !current.notify_reactions) return;
      playSoundUrl(await resolveSoundUrl(current, kind));
    };

    const channel = supabase.channel("notification-sounds");

    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      myId = data.user?.id ?? null;

      channel
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
          const row = payload.new as { sender_id?: string };
          if (!row.sender_id || row.sender_id === myId) return;
          void play("message");
        })
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "message_reactions" },
          async (payload) => {
            const row = payload.new as { user_id?: string; message_id?: string };
            if (!row.message_id || !row.user_id || row.user_id === myId) return;
            const { data: message } = await supabase
              .from("messages")
              .select("sender_id")
              .eq("id", row.message_id)
              .maybeSingle();
            if (message?.sender_id !== myId) return;
            void play("reaction");
          },
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, []);

  // Mensagens vindas do service worker (push recebido).
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string; payload?: { soundUrl?: string | null } };
      if (data?.type === "zaptri-push") {
        if (settingsRef.current?.sound_enabled) playSoundUrl(data.payload?.soundUrl ?? null);
        return;
      }
      if (data?.type === "zaptri-navigate" && data.url) {
        const [path, query] = data.url.split("?");
        const conversationId = new URLSearchParams(query ?? "").get("c");
        void navigate(
          conversationId
            ? { to: "/conversas", search: { c: conversationId } }
            : { to: (path || "/conversas") as "/conversas", search: {} },
        );
      }
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [navigate]);
}
