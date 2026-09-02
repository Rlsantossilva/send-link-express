import { memo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, CheckCheck, Copy, Download, Scissors, SmilePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createSignedUrl, type Message, type MessageReaction } from "@/lib/chat";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉"];


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
      return <video src={url} controls preload="metadata" className="max-h-72 w-full max-w-xs rounded-xl" />;
  }

  return (
    <div className="flex items-center gap-2">
      <audio src={url} controls preload="none" className="h-10 w-56" />
      <a href={url} download={message.media_name ?? "audio"} aria-label="Baixar áudio">
        <Download className="size-4 opacity-70" />
      </a>
    </div>
  );
}

function StatusTicks({ status }: { status: "sent" | "delivered" | "read" }) {
  const label =
    status === "read" ? "Visualizada" : status === "delivered" ? "Recebida" : "Enviada";
  return (
    <span aria-label={label} title={label} className="inline-flex items-center">
      {status === "read" ? (
        <CheckCheck className="size-3.5 text-tick-read" />
      ) : status === "delivered" ? (
        <CheckCheck className="size-3.5 text-tick-sent" />
      ) : (
        <Check className="size-3.5 text-tick-sent" />
      )}
    </span>
  );
}

export const MessageItem = memo(function MessageItem({
  message,
  isOwn,
  senderName,
  senderAvatar,
  showSender,
  reactions,
  myId,
  nameById,
  status,
  onDelete,
  onReact,
  selectionMode = false,
  selected = false,
  onToggleSelect,
  onStartSelection,
}: {
  message: Message;
  isOwn: boolean;
  senderName: string;
  senderAvatar?: string | null | undefined;
  showSender: boolean;
  reactions: MessageReaction[];
  myId: string;
  nameById?: Record<string, string>;
  status?: "sent" | "delivered" | "read" | undefined;
  onDelete: (id: string) => void;
  onReact: (messageId: string, emoji: string) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  onStartSelection?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [openChip, setOpenChip] = useState<string | null>(null);


  const grouped = new Map<string, MessageReaction[]>();
  for (const reaction of reactions) {
    const list = grouped.get(reaction.emoji) ?? [];
    list.push(reaction);
    grouped.set(reaction.emoji, list);
  }

  function reactorNames(list: MessageReaction[]) {
    return list.map((r) => (r.user_id === myId ? "Você" : nameById?.[r.user_id] ?? "Alguém"));
  }

  async function copyContent() {
    try {
      const text = message.body?.trim()
        ? message.body
        : message.media_path
          ? await createSignedUrl("chat-media", message.media_path)
          : "";
      if (!text) throw new Error("Nada para copiar");
      await navigator.clipboard.writeText(text);
      toast.success(message.kind === "text" ? "Texto copiado" : "Link da mídia copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  return (
    <div className={cn("content-auto flex items-end gap-2", isOwn ? "justify-end" : "justify-start")}>
      {!isOwn ? <UserAvatar path={senderAvatar} name={senderName} className="size-8" /> : null}

      <div className={cn("flex max-w-[85%] flex-col sm:max-w-[70%]", isOwn ? "items-end" : "items-start")}>
        {isOwn ? (
          <span className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Eu</span>
        ) : null}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <div
              role="button"
              tabIndex={0}
              aria-label="Opções da mensagem"
              className={cn(
                "group w-fit max-w-full cursor-pointer rounded-2xl px-3 py-2 text-left shadow-bubble outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring",
                isOwn
                  ? "rounded-br-sm bg-bubble-own text-bubble-own-foreground"
                  : "rounded-bl-sm border border-border bg-bubble-other text-bubble-other-foreground",
              )}
            >

              {showSender && !isOwn ? (
                <p className="mb-1 text-xs font-semibold text-primary">{senderName}</p>
              ) : null}

              {message.kind !== "text" ? <MediaContent message={message} /> : null}
              {message.body ? (
                <p className="mt-1 whitespace-pre-wrap break-words text-sm">{message.body}</p>
              ) : null}

              <div className="mt-1 flex items-center justify-end gap-1 text-[11px] opacity-70">
                <span>{timeLabel(message.created_at)}</span>
                {isOwn && status ? <StatusTicks status={status} /> : null}

              </div>
            </div>
          </PopoverTrigger>

          <PopoverContent align={isOwn ? "end" : "start"} className="w-auto p-2">
            <div className="flex gap-1 pb-2">
              {REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={`Reagir com ${emoji}`}
                  className="rounded-full px-1 text-lg transition-transform hover:scale-125"
                  onClick={() => {
                    onReact(message.id, emoji);
                    setOpen(false);
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-1 border-t border-border pt-2">
              <Button
                variant="ghost"
                size="sm"
                className="justify-start"
                onClick={() => {
                  void copyContent();
                  setOpen(false);
                }}
              >
                <Copy className="mr-2 size-4" /> Copiar
              </Button>

              {isOwn ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start"
                    onClick={async () => {
                      await copyContent();
                      onDelete(message.id);
                      setOpen(false);
                    }}
                  >
                    <Scissors className="mr-2 size-4" /> Recortar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start text-destructive"
                    onClick={() => {
                      onDelete(message.id);
                      setOpen(false);
                    }}
                  >
                    <Trash2 className="mr-2 size-4" /> Apagar
                  </Button>
                </>
              ) : null}
            </div>
          </PopoverContent>
        </Popover>

        <div className="mt-1 flex flex-wrap items-center justify-end gap-1">
          {[...grouped.entries()].map(([emoji, list]) => (
            <Popover
              key={emoji}
              open={openChip === emoji}
              onOpenChange={(value) => setOpenChip(value ? emoji : null)}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={`Ver quem reagiu com ${emoji}`}
                  className={cn(
                    "rounded-full border border-border/60 bg-background/70 px-1.5 py-0.5 text-[11px] text-foreground transition-colors hover:bg-muted",
                    list.some((r) => r.user_id === myId) && "border-primary",
                  )}
                >
                  {emoji} {list.length}
                </button>
              </PopoverTrigger>
              <PopoverContent align={isOwn ? "end" : "start"} className="w-auto max-w-56 p-2">
                <p className="mb-1 text-xs font-semibold">{emoji} reagiram</p>
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                  {reactorNames(list).map((name, index) => (
                    <li key={`${name}-${index}`}>{name}</li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>
          ))}

          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Reagir à mensagem"
                className="rounded-full border border-border/60 bg-background/70 p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <SmilePlus className="size-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align={isOwn ? "end" : "start"} className="w-auto p-2">
              <div className="flex gap-1">
                {REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    aria-label={`Reagir com ${emoji}`}
                    className="rounded-full px-1 text-lg transition-transform hover:scale-125"
                    onClick={() => {
                      onReact(message.id, emoji);
                      setPickerOpen(false);
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
});

