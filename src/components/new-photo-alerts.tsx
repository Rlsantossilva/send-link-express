import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus } from "lucide-react";

import { AvatarGalleryDialog } from "@/components/avatar-gallery-dialog";
import { listGlowingPreviews, listReactorNames, markGallerySeen } from "@/lib/gallery";

/**
 * Avisos de fotos novas dos amigos. Ao clicar, a foto abre direto no álbum
 * e o aviso desaparece (fica só o que ainda não foi visto).
 */
export function NewPhotoAlerts() {
  const queryClient = useQueryClient();
  const [openOwner, setOpenOwner] = useState<{ ownerId: string; photoId: string } | null>(null);

  const { data: previews = {} } = useQuery({
    queryKey: ["gallery-glow", "previews"],
    queryFn: listGlowingPreviews,
    staleTime: 30 * 1000,
  });

  const owners = Object.values(previews);

  const { data: names = {} } = useQuery({
    queryKey: ["reactor-names", owners.map((owner) => owner.userId).sort().join(",")],
    queryFn: () => listReactorNames(owners.map((owner) => owner.userId)),
    enabled: owners.length > 0,
  });

  if (owners.length === 0) return null;

  async function open(ownerId: string, photoId: string) {
    setOpenOwner({ ownerId, photoId });
    try {
      await markGallerySeen(ownerId);
    } catch {
      /* ignora falha de marcação */
    }
    void queryClient.invalidateQueries({ queryKey: ["gallery-glow"] });
  }

  return (
    <>
      <div className="border-b border-border/60 bg-primary/5">
        {owners.map((owner) => (
          <button
            key={owner.userId}
            type="button"
            onClick={() => void open(owner.userId, owner.photoId)}
            className="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-primary/10"
          >
            <ImagePlus className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate text-xs">
              <span className="font-semibold">{names[owner.userId] ?? "Alguém"}</span> adicionou uma
              foto nova
            </span>
            <span className="shrink-0 rounded-full bg-primary px-1.5 text-[10px] font-bold leading-4 text-primary-foreground">
              nova
            </span>
          </button>
        ))}
      </div>

      {openOwner ? (
        <AvatarGalleryDialog
          ownerId={openOwner.ownerId}
          initialPhotoId={openOwner.photoId}
          open
          onOpenChange={(value) => {
            if (!value) setOpenOwner(null);
          }}
        />
      ) : null}
    </>
  );
}
