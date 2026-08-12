import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { AvatarGalleryDialog } from "@/components/avatar-gallery-dialog";
import { requireUserId } from "@/lib/chat";
import { listMyPhotoReactionAlerts } from "@/lib/gallery";

/**
 * Avisos de reações recebidas nas fotos do meu álbum.
 * Ao clicar, abre o álbum já na foto que recebeu as reações.
 */
export function PhotoReactionAlerts() {
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null);

  const { data: myId } = useQuery({ queryKey: ["my-id"], queryFn: requireUserId });
  const { data: alerts = [] } = useQuery({
    queryKey: ["photo-reaction-alerts"],
    queryFn: listMyPhotoReactionAlerts,
    staleTime: 30 * 1000,
  });

  if (alerts.length === 0 || !myId) return null;

  return (
    <>
      <div className="border-b border-border/60 bg-secondary/10">
        {alerts.map((alert) => (
          <button
            key={alert.photoId}
            type="button"
            onClick={() => setOpenPhotoId(alert.photoId)}
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
