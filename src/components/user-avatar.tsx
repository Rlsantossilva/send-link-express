import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createSignedUrl } from "@/lib/chat";
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
}: {
  path?: string | null | undefined;
  name?: string | null | undefined;
  className?: string | undefined;
  online?: boolean | undefined;
}) {
  const { data: url } = useQuery({
    queryKey: ["avatar-url", path],
    queryFn: () => createSignedUrl("avatars", path as string),
    enabled: Boolean(path),
    staleTime: 30 * 60 * 1000,
  });

  return (
    <span className="relative inline-block shrink-0">
      <Avatar className={cn("size-11 border border-border", className)}>
        {url ? <AvatarImage src={url} alt={name ?? "Avatar"} /> : null}
        <AvatarFallback className="bg-sun-gradient font-semibold text-secondary-foreground">
          {initials(name)}
        </AvatarFallback>
      </Avatar>
      {online ? (
        <span
          aria-label="Online"
          title="Online"
          className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-background bg-online"
        />
      ) : null}
    </span>
  );
}

