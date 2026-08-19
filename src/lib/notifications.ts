import { supabase } from "@/integrations/supabase/client";
import { requireUserId } from "@/lib/chat";
import { BUILTIN_SOUNDS, CUSTOM_SOUND_ID, builtinSoundUrl } from "@/lib/notification-sounds";
import { removePushSubscription, savePushSubscription } from "@/lib/push.functions";

/** Chave pública VAPID (pode ficar no código; a privada está guardada no backend). */
export const VAPID_PUBLIC_KEY =
  "BJo-UcLagZVhrFIFwpAKwGinMHopnuPEF2kEcGUAo283KgOTSmo2j_kdg7MmQGI9qajfU9RAcizzxqq3wyGpUHA";

export type NotificationSettings = {
  user_id: string;
  push_enabled: boolean;
  sound_enabled: boolean;
  message_sound: string;
  reaction_sound: string;
  custom_sound_path: string | null;
  custom_sound_name: string | null;
  notify_reactions: boolean;
};

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("notification_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (data) return data as NotificationSettings;

  const { data: created, error: insertError } = await supabase
    .from("notification_settings")
    .insert({ user_id: userId })
    .select("*")
    .single();
  if (insertError) throw insertError;
  return created as NotificationSettings;
}

export async function saveNotificationSettings(patch: Partial<NotificationSettings>) {
  const userId = await requireUserId();
  const { error } = await supabase
    .from("notification_settings")
    .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" });
  if (error) throw error;
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function registerPushWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  return navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
}

/** Pede permissão do dispositivo (notificações + som) e inscreve este aparelho. */
export async function enablePushOnThisDevice(): Promise<void> {
  if (!pushSupported()) {
    throw new Error("Este navegador não suporta notificações push");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Permissão de notificações negada nas configurações do navegador");
  }

  const registration = (await registerPushWorker()) ?? (await navigator.serviceWorker.ready);
  await navigator.serviceWorker.ready;

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
    }));

  const json = subscription.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error("Não foi possível registrar este aparelho");
  }

  await savePushSubscription({
    data: {
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      userAgent: navigator.userAgent.slice(0, 300),
    },
  });

  await saveNotificationSettings({ push_enabled: true });
}

export async function disablePushOnThisDevice(): Promise<void> {
  await saveNotificationSettings({ push_enabled: false });
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration("/push-sw.js");
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await removePushSubscription({ data: { endpoint: subscription.endpoint } });
    await subscription.unsubscribe();
  }
}

export async function customSoundUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from("notification-sounds").createSignedUrl(path, 60 * 60 * 6);
  if (error) return null;
  return data.signedUrl;
}

export async function resolveSoundUrl(
  settings: NotificationSettings | null | undefined,
  kind: "message" | "reaction",
): Promise<string | null> {
  if (!settings) return builtinSoundUrl("classico");
  const soundId = kind === "reaction" ? settings.reaction_sound : settings.message_sound;
  if (soundId === CUSTOM_SOUND_ID && settings.custom_sound_path) {
    return customSoundUrl(settings.custom_sound_path);
  }
  return builtinSoundUrl(soundId) ?? builtinSoundUrl("classico");
}

/** Silêncio curto em WAV — mantém a sessão de áudio viva em segundo plano. */
const SILENCE_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=";

let keepAlive: HTMLAudioElement | null = null;

/**
 * Mantém o app "tocando" em segundo plano com um áudio silencioso em loop.
 * Assim o navegador não suspende a aba e os sons de aviso continuam audíveis
 * com a tela bloqueada ou o app minimizado.
 */
export function startBackgroundAudio() {
  if (typeof window === "undefined") return;
  try {
    if (!keepAlive) {
      keepAlive = new Audio(SILENCE_WAV);
      keepAlive.loop = true;
      keepAlive.volume = 0.0001;
      keepAlive.setAttribute("playsinline", "");
    }
    void keepAlive.play().catch(() => undefined);

    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: "Zap Tri",
        artist: "Avisos de mensagens",
      });
      navigator.mediaSession.playbackState = "playing";
    }

    const resume = () => {
      if (keepAlive?.paused) void keepAlive.play().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    keepAlive.addEventListener("pause", resume);
  } catch {
    /* alguns navegadores só permitem áudio após um toque */
  }
}

/** Destrava o áudio no celular: precisa acontecer dentro de um toque do usuário. */
export function unlockAudio() {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      const source = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(gain).connect(ctx.destination);
      source.start();
      source.stop(ctx.currentTime + 0.02);
      void ctx.resume();
    }
  } catch {
    /* alguns navegadores bloqueiam áudio antes do primeiro toque */
  }
  startBackgroundAudio();
}

const BACKGROUND_KEY = "zaptri-background-audio";

/** Mantém tela/áudio ativos para os avisos tocarem com o app em segundo plano. */
export async function enableBackgroundMode(): Promise<void> {
  if (typeof window === "undefined") return;
  unlockAudio();
  window.localStorage.setItem(BACKGROUND_KEY, "1");
  try {
    const wl = (navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
    }).wakeLock;
    if (wl) await wl.request("screen").catch(() => undefined);
  } catch {
    /* alguns navegadores não suportam wake lock */
  }
  if (!keepAlive || keepAlive.paused) startBackgroundAudio();
  if (keepAlive?.paused) {
    throw new Error("Toque na tela novamente para liberar o som em segundo plano");
  }
}

export function backgroundModeEnabled() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(BACKGROUND_KEY) === "1";
}

export function disableBackgroundMode() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(BACKGROUND_KEY);
  keepAlive?.pause();
}

export function playSoundUrl(url: string | null) {

  if (!url || typeof window === "undefined") return;
  try {
    const audio = new Audio(url);
    audio.volume = 1;
    audio.setAttribute("playsinline", "");
    void audio.play().catch(() => undefined);
  } catch {
    /* alguns navegadores exigem um toque na tela antes de tocar áudio */
  }
}

const MAX_SOUND_BYTES = 2 * 1024 * 1024;

export async function uploadCustomSound(file: File) {
  if (!file.type.startsWith("audio/")) throw new Error("Envie um arquivo de áudio (mp3, wav, ogg)");
  if (file.size > MAX_SOUND_BYTES) throw new Error("O som deve ter no máximo 2 MB");
  const userId = await requireUserId();
  const extension = file.name.split(".").pop() ?? "mp3";
  const path = `${userId}/notificacao-${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from("notification-sounds").upload(path, file, {
    contentType: file.type || "audio/mpeg",
    upsert: true,
  });
  if (error) throw error;
  return { path, name: file.name };
}

export { BUILTIN_SOUNDS, CUSTOM_SOUND_ID };
