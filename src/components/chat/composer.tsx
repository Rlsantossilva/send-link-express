import { useRef, useState } from "react";
import { Image as ImageIcon, Mic, Send, Square, Video, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PendingFile = { file: File; kind: "image" | "video" };

export function Composer({
  disabled,
  onSendText,
  onSendMedia,
}: {
  disabled?: boolean | undefined;
  onSendText: (body: string) => Promise<void>;
  onSendMedia: (input: {
    file: File | Blob;
    kind: "image" | "video" | "audio";
    fileName: string;
    durationSeconds?: number;
    caption?: string;
  }) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState<PendingFile | null>(null);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function handleSend() {
    if (sending) return;
    const body = text.trim();
    if (!pending && !body) return;

    setSending(true);
    try {
      if (pending) {
        await onSendMedia({
          file: pending.file,
          kind: pending.kind,
          fileName: pending.file.name,
          ...(body ? { caption: body } : {}),
        });
      } else {
        await onSendText(body);
      }
      setText("");
      setPending(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar");
    } finally {
      setSending(false);
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        const duration = seconds;
        setSeconds(0);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size === 0) return;
        const extension = (recorder.mimeType || "audio/webm").includes("mp4") ? "m4a" : "webm";
        try {
          await onSendMedia({
            file: blob,
            kind: "audio",
            fileName: `audio-${Date.now()}.${extension}`,
            durationSeconds: duration,
          });
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Não foi possível enviar o áudio");
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      timerRef.current = setInterval(() => setSeconds((value) => value + 1), 1000);
    } catch {
      toast.error("Não foi possível acessar o microfone");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  return (
    <div className="border-t border-border bg-card p-3">
      {pending ? (
        <div className="mb-2 flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm">
          <span className="truncate">
            {pending.kind === "image" ? "📷" : "🎬"} {pending.file.name}
          </span>
          <Button variant="ghost" size="icon" className="ml-auto size-6" onClick={() => setPending(null)}>
            <X className="size-3" />
          </Button>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <input
          ref={imageInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) setPending({ file, kind: "image" });
            event.target.value = "";
          }}
        />
        <input
          ref={videoInput}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) setPending({ file, kind: "video" });
            event.target.value = "";
          }}
        />

        <Button
          variant="ghost"
          size="icon"
          aria-label="Enviar foto"
          disabled={disabled || recording}
          onClick={() => imageInput.current?.click()}
        >
          <ImageIcon className="size-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Enviar vídeo"
          disabled={disabled || recording}
          onClick={() => videoInput.current?.click()}
        >
          <Video className="size-5" />
        </Button>

        {recording ? (
          <div className="flex flex-1 items-center gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <span className="size-2 animate-pulse rounded-full bg-destructive" />
            Gravando… {seconds}s
          </div>
        ) : (
          <Input
            value={text}
            disabled={disabled}
            placeholder="Escreva uma mensagem"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
            className="flex-1 rounded-xl"
          />
        )}

        <Button
          variant={recording ? "destructive" : "ghost"}
          size="icon"
          aria-label={recording ? "Parar gravação" : "Gravar áudio"}
          disabled={disabled}
          onClick={() => (recording ? stopRecording() : void startRecording())}
        >
          {recording ? <Square className="size-4" /> : <Mic className="size-5" />}
        </Button>

        <Button
          size="icon"
          aria-label="Enviar mensagem"
          disabled={disabled || sending || recording || (!text.trim() && !pending)}
          onClick={() => void handleSend()}
        >
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}
