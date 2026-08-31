import { useEffect, useRef, useState } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { getNotificationSettings, playSoundUrl, resolveSoundUrl } from "@/lib/notifications";
import { messagePreview, type Message } from "@/lib/chat";
import { cn } from "@/lib/utils";

type Banner = {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  preview: string;
  kind: "message" | "reaction";
  emoji?: string;
};

const BANNER_TTL_MS = 5_000;
const MAX_BANNERS = 3;

export function InAppNotificationBanner() {
  const navigate = useNavigate();
  const router = useRouter();
  const [banners, setBanners] = useState<Banner[]>([]);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;
    let myId: string | null = null;

    const settingsPromise = getNotificationSettings().catch(() => null);

    const play = async (kind: "message" | "reaction") => {
      const settings = await settingsPromise;
      if (!settings?.sound_enabled) return;
      if (kind === "reaction" && !settings?.notify_reactions) return;
      if (kind === "message" && settings.sound_messages === false) return;
      if (kind === "reaction" && settings.sound_reactions === false) return;
      playSoundUrl(await resolveSoundUrl(settings, kind));
    };

    const bannerAllowed = async (kind: "message" | "reaction") => {
      const settings = await settingsPromise;
      if (!settings) return true;
      if (kind === "reaction" && !settings.notify_reactions) return false;
      return kind === "message" ? settings.banner_messages !== false : settings.banner_reactions !== false;
    };

    const profileCache = new Map<string, { display_name: string; avatar_url: string | null }>();

    async function getProfile(userId: string) {
      const cached = profileCache.get(userId);
      if (cached) return cached;
      const { data } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", userId)
        .maybeSingle();
      const profile = {
        display_name: data?.display_name || "Alguém",
        avatar_url: (data?.avatar_url as string | null) ?? null,
      };
      profileCache.set(userId, profile);
      return profile;
    }

    function isCurrentConversation(conversationId: string) {
      const loc = router.state.location;
      if (loc.pathname !== "/conversas") return false;
      const convId = new URLSearchParams(loc.searchStr).get("c");
      return convId === conversationId;
    }

    async function pushBanner(banner: Banner) {
      if (cancelled) return;
      if (isCurrentConversation(banner.conversationId)) return;

      void play(banner.kind);
      if (!(await bannerAllowed(banner.kind))) return;
      if (cancelled) return;

      setBanners((prev) => {
        const next = [...prev, banner];
        if (next.length > MAX_BANNERS) next.shift();
        return next;
      });

      void play(banner.kind);

      const timer = setTimeout(() => {
        timersRef.current.delete(timer);
        setBanners((prev) => prev.filter((b) => b.id !== banner.id));
      }, BANNER_TTL_MS);
      timersRef.current.add(timer);
    }

    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      myId = data.user?.id ?? null;
      if (!myId) return;

      const channel = supabase.channel("in-app-notifications");
      channel
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          async (payload) => {
            const row = payload.new as Message;
            if (!row.sender_id || row.sender_id === myId) return;
            if (isCurrentConversation(row.conversation_id)) return;

            const profile = await getProfile(row.sender_id);
            pushBanner({
              id: `msg-${row.id}-${Date.now()}`,
              conversationId: row.conversation_id,
              senderId: row.sender_id,
              senderName: profile.display_name,
              senderAvatar: profile.avatar_url,
              preview: messagePreview(row),
              kind: "message",
            });
          },
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "message_reactions" },
          async (payload) => {
            const row = payload.new as { id: string; user_id: string; message_id: string; emoji: string };
            if (!row.user_id || row.user_id === myId) return;

            const { data: message } = await supabase
              .from("messages")
              .select("conversation_id, sender_id")
              .eq("id", row.message_id)
              .maybeSingle();
            if (!message || message.sender_id !== myId) return;
            if (isCurrentConversation(message.conversation_id)) return;

            const profile = await getProfile(row.user_id);
            pushBanner({
              id: `react-${row.id}-${Date.now()}`,
              conversationId: message.conversation_id,
              senderId: row.user_id,
              senderName: profile.display_name,
              senderAvatar: profile.avatar_url,
              preview: `reagiu ${row.emoji}`,
              kind: "reaction",
              emoji: row.emoji,
            });
          },
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      for (const timer of timersRef.current) clearTimeout(timer);
      timersRef.current.clear();
    };
  }, [router]);

  if (typeof window === "undefined" || banners.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 p-3 sm:p-4"
    >
      {banners.map((banner, index) => (
        <div
          key={banner.id}
          role="button"
          tabIndex={0}
          onClick={() => {
            setBanners((prev) => prev.filter((b) => b.id !== banner.id));
            void navigate({ to: "/conversas", search: { c: banner.conversationId } });
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setBanners((prev) => prev.filter((b) => b.id !== banner.id));
              void navigate({ to: "/conversas", search: { c: banner.conversationId } });
            }
          }}
          style={{ animationDelay: `${index * 60}ms` }}
          className={cn(
            "pointer-events-auto flex w-full max-w-md animate-in cursor-pointer items-center gap-3 rounded-2xl border border-border bg-background/95 p-3 shadow-panel backdrop-blur-sm fade-in slide-in-from-top-full duration-300",
            "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <UserAvatar path={banner.senderAvatar} name={banner.senderName} className="size-12" />

          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-semibold">{banner.senderName}</p>
            <p className="truncate text-xs text-muted-foreground">{banner.preview}</p>
          </div>

          <button
            type="button"
            aria-label="Fechar notificação"
            onClick={(event) => {
              event.stopPropagation();
              setBanners((prev) => prev.filter((b) => b.id !== banner.id));
            }}
            className="pointer-events-auto rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
