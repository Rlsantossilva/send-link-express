import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarGalleryDialog } from "@/components/avatar-gallery-dialog";
import { createSignedUrl, requireUserId } from "@/lib/chat";
import { listGlowingUserIds, markGallerySeen } from "@/lib/gallery";
import { cn } from "@/lib/utils";

function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function UserAvatar({
  path,
  name,
  className,
  online,
  userId,
}: {
  path?: string | null | undefined;
  name?: string | null | undefined;
  className?: string | undefined;
  online?: boolean | undefined;
  /** Quando informado, o avatar abre a biblioteca de fotos e brilha em novidades. */
  userId?: string | null | undefined;
}) {
  const queryClient = useQueryClient();
  const [galleryOpen, setGalleryOpen] = useState(false);

  const { data: url } = useQuery({
    queryKey: ["avatar-url", path],
    queryFn: () => createSignedUrl("avatars", path as string),
    enabled: Boolean(path),
    staleTime: 30 * 60 * 1000,
  });

  const { data: myId } = useQuery({
    queryKey: ["my-id"],
    queryFn: requireUserId,
    enabled: Boolean(userId),
    staleTime: Infinity,
  });

  const { data: glowing = [] } = useQuery({
    queryKey: ["gallery-glow"],
    queryFn: listGlowingUserIds,
    enabled: Boolean(userId),
    staleTime: 30 * 1000,
  });

  const hasNews = Boolean(userId) && glowing.includes(userId as string);

  const picture = (
    <span className="relative inline-block shrink-0">
      {hasNews ? <span aria-hidden className={cn("avatar-star-glow", className)} /> : null}
      <Avatar
        className={cn(
          "size-11 border border-border",
          hasNews && "avatar-star-ring border-transparent",
          className,
        )}
      >
        {url ? <AvatarImage src={url} alt={name ?? "Avatar"} /> : null}
        <AvatarFallback className="bg-sun-gradient font-semibold text-secondary-foreground">
          {initials(name)}
        </AvatarFallback>
      </Avatar>
      {hasNews ? (
        <>
          <span
            aria-hidden
            className="avatar-star-spark absolute -left-1 -top-1 z-10 text-[11px] leading-none"
          >
            ✨
          </span>
          {url ? (
            <img
              aria-hidden
              src={url}
              alt=""
              className="avatar-photo-float pointer-events-none absolute left-full top-1/2 ml-1 size-6 rounded-md border border-secondary/70 object-cover shadow-sm"
            />
          ) : null}
        </>
      ) : null}

      {online ? (
        <span
          aria-label="Online"
          title="Online"
          className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-background bg-online"
        />
      ) : null}
    </span>
  );

  if (!userId) return picture;

  return (
    <>
      <button
        type="button"
        aria-label={hasNews ? `Ver fotos novas de ${name ?? "contato"}` : `Ver fotos de ${name ?? "contato"}`}
        className="rounded-full outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
        onClick={(event) => {
          event.stopPropagation();
          event.preventDefault();
          setGalleryOpen(true);
          if (myId && myId !== userId) {
            void markGallerySeen(userId).then(() => {
              void queryClient.invalidateQueries({ queryKey: ["gallery-glow"] });
            });
          }
        }}
      >
        {picture}
      </button>
      {galleryOpen ? (
        <AvatarGalleryDialog
          ownerId={userId}
          name={name}
          canManage={myId === userId}
          open={galleryOpen}
          onOpenChange={setGalleryOpen}
        />
      ) : null}
    </>
  );
}
