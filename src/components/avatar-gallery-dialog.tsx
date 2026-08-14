import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ImagePlus, Sparkles, SmilePlus, Trash2, X } from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useServerFn } from "@tanstack/react-start";
import { createSignedUrl, requireUserId } from "@/lib/chat";
import { resolveDisplayNames } from "@/lib/gallery.functions";
import {
  deleteAvatarPhoto,
  listAvatarPhotos,
  listPhotoReactions,
  togglePhotoReaction,
  uploadAvatarPhoto,
  type AvatarPhoto,
  type PhotoReaction,
} from "@/lib/gallery";

const PHOTO_REACTIONS = ["❤️", "😍", "👏", "😂", "😮", "🔥", "🙏", "🎉"];

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

function ReactionChips({
  reactions,
  names,
  myId,
  compact,
}: {
  reactions: PhotoReaction[];
  names: Record<string, string>;
  myId?: string | undefined;
  compact?: boolean;
}) {
  const grouped = new Map<string, PhotoReaction[]>();
  for (const reaction of reactions) {
    const list = grouped.get(reaction.emoji) ?? [];
    list.push(reaction);
    grouped.set(reaction.emoji, list);
  }
  if (grouped.size === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {[...grouped.entries()].map(([emoji, list]) => (
        <Popover key={emoji}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`Ver quem reagiu com ${emoji}`}
              className={cnChip(compact)}
            >
              <span>{emoji}</span>
              <span className="font-semibold">{list.length}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto max-w-56 p-2 text-xs">
            <p className="mb-1 font-semibold">
              {emoji} {list.length} {list.length === 1 ? "reação" : "reações"}
            </p>
            <ul className="space-y-0.5 text-muted-foreground">
              {list.map((reaction) => (
                <li key={reaction.id}>
                  {reaction.user_id === myId ? "Você" : names[reaction.user_id] ?? "Alguém"}
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      ))}
    </div>
  );
}

function cnChip(compact?: boolean) {
  return [
    "inline-flex items-center gap-0.5 rounded-full border border-border bg-background/90 shadow-sm transition-transform hover:scale-110",
    compact ? "px-1 py-0 text-[10px]" : "px-2 py-0.5 text-xs",
  ].join(" ");
}

export function AvatarGalleryDialog({
  ownerId,
  name,
  canManage,
  open,
  onOpenChange,
  initialPhotoId,
}: {
  ownerId: string;
  name?: string | null | undefined;
  canManage: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPhotoId?: string | undefined;
}) {
  const queryClient = useQueryClient();
  const [zoom, setZoom] = useState<AvatarPhoto | null>(null);

  const { data: myId } = useQuery({ queryKey: ["my-id"], queryFn: requireUserId });

  const { data: photos = [], isLoading } = useQuery({
    queryKey: ["avatar-photos", ownerId],
    queryFn: () => listAvatarPhotos(ownerId),
    enabled: open,
  });

  const { data: reactions = [] } = useQuery({
    queryKey: ["avatar-photo-reactions", ownerId, photos.map((photo) => photo.id).join(",")],
    queryFn: () => listPhotoReactions(photos.map((photo) => photo.id)),
    enabled: open && photos.length > 0,
  });

  const fetchNames = useServerFn(resolveDisplayNames);
  const { data: names = {} } = useQuery({
    queryKey: ["reactor-names", reactions.map((reaction) => reaction.user_id).join(",")],
    queryFn: () => fetchNames({ data: { ids: [...new Set(reactions.map((r) => r.user_id))] } }),
    enabled: reactions.length > 0,
  });

  useEffect(() => {
    if (!initialPhotoId || photos.length === 0) return;
    const target = photos.find((photo) => photo.id === initialPhotoId);
    if (target) setZoom(target);
  }, [initialPhotoId, photos]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["avatar-photos", ownerId] });
    void queryClient.invalidateQueries({ queryKey: ["gallery-glow"] });
  };

  const refreshReactions = () => {
    void queryClient.invalidateQueries({ queryKey: ["avatar-photo-reactions"] });
    void queryClient.invalidateQueries({ queryKey: ["photo-reaction-alerts"] });
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

  const reactMutation = useMutation({
    mutationFn: ({ photoId, emoji }: { photoId: string; emoji: string }) =>
      togglePhotoReaction(photoId, emoji),
    onSuccess: refreshReactions,
    onError: (error: Error) => toast.error(error.message),
  });

  const photoAt = (step: number) => {
    if (!zoom || photos.length === 0) return zoom;
    const index = photos.findIndex((photo) => photo.id === zoom.id);
    if (index < 0) return zoom;
    return photos[(index + step + photos.length) % photos.length] ?? zoom;
  };

  const reactionsOf = (photoId: string) =>
    reactions.filter((reaction) => reaction.photo_id === photoId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] w-[96vw] max-w-6xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-secondary" />
            {canManage ? "Sua biblioteca de fotos" : `Fotos de ${name || "contato"}`}
          </DialogTitle>
          <DialogDescription>
            {canManage
              ? "Adicione fotos ao seu avatar e veja quem reagiu a cada uma delas."
              : "Toque para ampliar e reaja com emojis nas fotos."}
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

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando fotos…</p>
          ) : photos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {canManage ? "Você ainda não adicionou fotos." : "Nenhuma foto por aqui ainda."}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
              {photos.map((photo) => (
                <div key={photo.id} className="space-y-1">
                  <div className="group relative aspect-square overflow-hidden rounded-xl border border-border">
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
                  <ReactionChips
                    compact
                    reactions={reactionsOf(photo.id)}
                    names={names}
                    myId={myId}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {zoom ? (
          <Dialog open onOpenChange={() => setZoom(null)}>
            <DialogContent className="max-w-2xl p-3 [&>button]:hidden">
              <DialogHeader className="sr-only">
                <DialogTitle>Foto ampliada</DialogTitle>
              </DialogHeader>
              <div className="relative max-h-[60dvh] overflow-hidden rounded-xl">
                <GalleryImage photo={zoom} />

                <Button
                  size="icon"
                  variant="secondary"
                  aria-label="Fechar foto"
                  className="absolute right-2 top-2 size-10 rounded-full border border-border shadow-lg"
                  onClick={() => setZoom(null)}
                >
                  <X className="size-5" />
                </Button>

                {photos.length > 1 ? (
                  <>
                    <Button
                      size="icon"
                      variant="secondary"
                      aria-label="Foto anterior"
                      className="absolute left-2 top-1/2 size-10 -translate-y-1/2 rounded-full border border-border shadow-lg"
                      onClick={() => setZoom(photoAt(-1))}
                    >
                      <ChevronLeft className="size-5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="secondary"
                      aria-label="Próxima foto"
                      className="absolute right-2 top-1/2 size-10 -translate-y-1/2 rounded-full border border-border shadow-lg"
                      onClick={() => setZoom(photoAt(1))}
                    >
                      <ChevronRight className="size-5" />
                    </Button>
                  </>
                ) : null}
              </div>
              {zoom.caption ? <p className="pt-2 text-sm text-muted-foreground">{zoom.caption}</p> : null}

              <div className="flex items-center gap-2 pt-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2 rounded-full">
                      <SmilePlus className="size-4 text-secondary" /> Reagir
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2">
                    <div className="flex flex-wrap gap-1">
                      {PHOTO_REACTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          aria-label={`Reagir com ${emoji}`}
                          disabled={reactMutation.isPending}
                          className="rounded-full px-1 text-2xl transition-transform hover:scale-125"
                          onClick={() => reactMutation.mutate({ photoId: zoom.id, emoji })}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                <ReactionChips reactions={reactionsOf(zoom.id)} names={names} myId={myId} />
              </div>
            </DialogContent>
          </Dialog>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
