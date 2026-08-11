import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { createSignedUrl } from "@/lib/chat";
import {
  deleteAvatarPhoto,
  listAvatarPhotos,
  uploadAvatarPhoto,
  type AvatarPhoto,
} from "@/lib/gallery";

function GalleryImage({ photo }: { photo: AvatarPhoto }) {
  const { data: url } = useQuery({
    queryKey: ["avatar-url", photo.path],
    queryFn: () => createSignedUrl("avatars", photo.path),
    staleTime: 30 * 60 * 1000,
  });

  return url ? (
    <img
      src={url}
      alt={photo.caption ?? "Foto da biblioteca"}
      loading="lazy"
      className="size-full object-cover"
    />
  ) : (
    <div className="size-full animate-pulse bg-muted" />
  );
}

export function AvatarGalleryDialog({
  ownerId,
  name,
  canManage,
  open,
  onOpenChange,
}: {
  ownerId: string;
  name?: string | null | undefined;
  canManage: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [zoom, setZoom] = useState<AvatarPhoto | null>(null);

  const { data: photos = [], isLoading } = useQuery({
    queryKey: ["avatar-photos", ownerId],
    queryFn: () => listAvatarPhotos(ownerId),
    enabled: open,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["avatar-photos", ownerId] });
    void queryClient.invalidateQueries({ queryKey: ["gallery-glow"] });
  };

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadAvatarPhoto(file),
    onSuccess: () => {
      refresh();
      toast.success("Foto adicionada — seu avatar vai brilhar para os amigos ✨");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (photo: AvatarPhoto) => deleteAvatarPhoto(photo),
    onSuccess: () => {
      refresh();
      setZoom(null);
      toast.success("Foto removida");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-secondary" />
            {canManage ? "Sua biblioteca de fotos" : `Fotos de ${name || "contato"}`}
          </DialogTitle>
          <DialogDescription>
            {canManage
              ? "Adicione fotos ao seu avatar. Cada foto nova faz seu avatar brilhar como uma estrela para quem ainda não viu."
              : "Toque em uma foto para ampliar."}
          </DialogDescription>
        </DialogHeader>

        {canManage ? (
          <div>
            <Label htmlFor="gallery-upload" className="cursor-pointer">
              <span className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
                <ImagePlus className="size-4" /> Adicionar foto
              </span>
            </Label>
            <input
              id="gallery-upload"
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploadMutation.isPending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) uploadMutation.mutate(file);
                event.target.value = "";
              }}
            />
          </div>
        ) : null}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando fotos…</p>
        ) : photos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {canManage ? "Você ainda não adicionou fotos." : "Nenhuma foto por aqui ainda."}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((photo) => (
              <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-xl border border-border">
                <button
                  type="button"
                  className="size-full"
                  onClick={() => setZoom(photo)}
                  aria-label="Ampliar foto"
                >
                  <GalleryImage photo={photo} />
                </button>
                {canManage ? (
                  <Button
                    size="icon"
                    variant="secondary"
                    aria-label="Apagar foto"
                    className="absolute right-1 top-1 size-7 opacity-90"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(photo)}
                  >
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {zoom ? (
          <Dialog open onOpenChange={() => setZoom(null)}>
            <DialogContent className="max-w-lg p-2">
              <DialogHeader className="sr-only">
                <DialogTitle>Foto ampliada</DialogTitle>
              </DialogHeader>
              <div className="overflow-hidden rounded-xl">
                <GalleryImage photo={zoom} />
              </div>
              {zoom.caption ? <p className="p-2 text-sm text-muted-foreground">{zoom.caption}</p> : null}
            </DialogContent>
          </Dialog>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
