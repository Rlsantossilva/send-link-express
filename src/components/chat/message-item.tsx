import { useQuery } from "@tanstack/react-query";
import { Download, Trash2 } from "lucide-react";
import { createSignedUrl, type Message } from "@/lib/chat";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function MediaContent({ message }: { message: Message }) {
  const { data: url, isLoading } = useQuery({
    queryKey: ["media-url", message.media_path],
    queryFn: () => createSignedUrl("chat-media", message.media_path as string),
    enabled: Boolean(message.media_path),
    staleTime: 30 * 60 * 1000,
  });

  if (isLoading || !url) {
    return <div className="h-40 w-56 animate-pulse rounded-xl bg-muted" />;
  }

  if (message.kind === "image") {
    return (
      <img
        src={url}
        alt={message.media_name ?? "Imagem enviada na conversa"}
        loading="lazy"
        className="max-h-72 w-full max-w-xs rounded-xl object-cover"
      />
    );
  }

  if (message.kind === "video") {
    return <video src={url} controls className="max-h-72 w-full max-w-xs rounded-xl" />;
  }

  return (
    <div className="flex items-center gap-2">
      <audio src={url} controls className="h-10 w-56" />
      <a href={url} download={message.media_name ?? "audio"} aria-label="Baixar áudio">
        <Download className="size-4 opacity-70" />
      </a>
    </div>
  );
}

export function MessageItem({
  message,
  isOwn,
  senderName,
  senderAvatar,
  showSender,
  onDelete,
}: {
  message: Message;
  isOwn: boolean;
  senderName: string;
  senderAvatar?: string | null;
  showSender: boolean;
  onDelete: (id: string) => void;
}) {
  return (
    <div className={cn("flex items-end gap-2", isOwn ? "justify-end" : "justify-start")}>
      {!isOwn ? <UserAvatar path={senderAvatar} name={senderName} className="size-8" /> : null}

      <div
        className={cn(
          "group max-w-[85%] rounded-2xl px-3 py-2 shadow-bubble sm:max-w-[70%]",
          isOwn
            ? "rounded-br-sm bg-bubble-own text-bubble-own-foreground"
            : "rounded-bl-sm border border-border bg-bubble-other text-bubble-other-foreground",
        )}
      >
        {showSender && !isOwn ? (
          <p className="mb-1 text-xs font-semibold text-primary">{senderName}</p>
        ) : null}

        {message.kind !== "text" ? <MediaContent message={message} /> : null}
        {message.body ? <p className="mt-1 whitespace-pre-wrap break-words text-sm">{message.body}</p> : null}

        <div className="mt-1 flex items-center justify-end gap-1 text-[11px] opacity-70">
          <span>{timeLabel(message.created_at)}</span>
          {isOwn ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-5 opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Apagar mensagem"
              onClick={() => onDelete(message.id)}
            >
              <Trash2 className="size-3" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
