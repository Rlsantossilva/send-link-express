import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Share, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  enablePushOnThisDevice,
  getNotificationSettings,
  pushSupported,
  resolveSoundUrl,
  playSoundUrl,
  unlockAudio,
} from "@/lib/notifications";

const DISMISS_KEY = "zaptri-push-banner-dismissed";

function isIos() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

/** Banner de 1 toque para ligar avisos e som no celular. */
export function EnableNotificationsBanner() {
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(true);
  const [ready, setReady] = useState(false);
  const [needsInstall, setNeedsInstall] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ["notification-settings"],
    queryFn: getNotificationSettings,
    staleTime: 30_000,
    retry: false,
  });
  const [subscribedHere, setSubscribedHere] = useState<boolean | null>(null);

  useEffect(() => {
    // Dispensa vale apenas para a sessão atual: o aviso volta a aparecer depois.
    setDismissed(window.sessionStorage.getItem(DISMISS_KEY) === "1");
    setNeedsInstall(isIos() && !isStandalone());
    setReady(true);

    let active = true;
    void (async () => {
      if (!pushSupported()) {
        if (active) setSubscribedHere(false);
        return;
      }
      const registration = await navigator.serviceWorker.getRegistration("/push-sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      if (active) setSubscribedHere(Notification.permission === "granted" && Boolean(subscription));
    })();
    return () => {
      active = false;
    };
  }, []);

  const enable = useMutation({
    mutationFn: async () => {
      unlockAudio();
      await enablePushOnThisDevice();
    },
    onSuccess: async () => {
      setSubscribedHere(true);
      await queryClient.invalidateQueries({ queryKey: ["notification-settings"] });
      const fresh = await getNotificationSettings();
      playSoundUrl(await resolveSoundUrl(fresh, "message"));
      toast.success("Avisos e som ativados neste aparelho");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!ready || dismissed) return null;
  // Só esconde quando este aparelho já está realmente inscrito e ligado.
  if (settings?.push_enabled && subscribedHere) return null;
  if (!needsInstall && !pushSupported()) return null;

  const hide = () => {
    window.sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="relative border-b border-border/60 bg-primary/10 px-4 py-3">
      <button
        onClick={hide}
        aria-label="Dispensar aviso"
        className="absolute right-2 top-2 rounded-full p-1 text-muted-foreground hover:bg-muted"
      >
        <X className="size-4" />
      </button>

      {needsInstall ? (
        <div className="pr-6">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Share className="size-4" /> Ativar som no iPhone
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Toque em <strong>Compartilhar</strong> na barra do Safari e escolha{" "}
            <strong>Adicionar à Tela de Início</strong>. Depois abra o Zap Tri pelo ícone e toque em
            “Ativar avisos e som”.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 pr-6">
          <div>
            <p className="text-sm font-semibold text-foreground">Ouvir novas mensagens</p>
            <p className="text-xs text-muted-foreground">
              Um toque para permitir avisos e som, mesmo com a tela bloqueada.
            </p>
          </div>
          <Button size="sm" onClick={() => enable.mutate()} disabled={enable.isPending}>
            <BellRing className="mr-1 size-4" />
            {enable.isPending ? "Ativando…" : "Ativar avisos e som"}
          </Button>
        </div>
      )}
    </div>
  );
}
