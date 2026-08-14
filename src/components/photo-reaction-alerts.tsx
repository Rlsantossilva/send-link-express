import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { AvatarGalleryDialog } from "@/components/avatar-gallery-dialog";
import { requireUserId } from "@/lib/chat";
import { listMyPhotoReactionAlerts } from "@/lib/gallery";

const STORAGE_KEY = "photo-reaction-alerts-seen";

/** Assinatura da notificação: muda quando chegam novas reações na mesma foto. */
function signature(alert: { photoId: string; total: number; lastAt: string }) {
  return `${alert.photoId}:${alert.total}:${alert.lastAt}`;
}

function readSeen(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Avisos de reações recebidas nas fotos do meu álbum.
 * Ao clicar, abre o álbum já na foto e o aviso desaparece — restam só os não vistos.
 */
export function PhotoReactionAlerts() {
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null);
  const [seen, setSeen] = useState<string[]>([]);

  useEffect(() => {
    setSeen(readSeen());
  }, []);

  const { data: myId } = useQuery({ queryKey: ["my-id"], queryFn: requireUserId });
  const { data: alerts = [] } = useQuery({
    queryKey: ["photo-reaction-alerts"],
    queryFn: listMyPhotoReactionAlerts,
    staleTime: 30 * 1000,
  });

  const visible = alerts.filter((alert) => !seen.includes(signature(alert)));

  function dismiss(alert: (typeof alerts)[number]) {
    const next = [...new Set([...seen, signature(alert)])].slice(-200);
    setSeen(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* armazenamento indisponível */
    }
    setOpenPhotoId(alert.photoId);
  }

  if (visible.length === 0 || !myId) return null;

  return (
    <>
      <div className="border-b border-border/60 bg-secondary/10">
        {visible.map((alert) => (
          <button
            key={alert.photoId}
            type="button"
            onClick={() => dismiss(alert)}
            className="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-secondary/20"
          >
            <Heart className="size-4 shrink-0 text-destructive" />
            <span className="min-w-0 flex-1 truncate text-xs">
              <span className="mr-1">{alert.emojis.join(" ")}</span>
              <span className="font-semibold">{alert.names.slice(0, 2).join(", ")}</span>
              {alert.names.length > 2 ? ` e mais ${alert.names.length - 2}` : ""} reagiu à sua foto
            </span>
            <span className="shrink-0 rounded-full bg-destructive px-1.5 text-[10px] font-bold leading-4 text-destructive-foreground">
              {alert.total}
            </span>
          </button>
        ))}
      </div>

      {openPhotoId ? (
        <AvatarGalleryDialog
          ownerId={myId}
          canManage
          initialPhotoId={openPhotoId}
          open
          onOpenChange={(open) => {
            if (!open) setOpenPhotoId(null);
          }}
        />
      ) : null}
    </>
  );
}
