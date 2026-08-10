import bolha from "@/assets/sounds/bolha.mp3.asset.json";
import classico from "@/assets/sounds/classico.mp3.asset.json";
import pop from "@/assets/sounds/pop.mp3.asset.json";
import sino from "@/assets/sounds/sino.mp3.asset.json";
import suave from "@/assets/sounds/suave.mp3.asset.json";

export type SoundOption = { id: string; label: string; url: string };

export const CUSTOM_SOUND_ID = "personalizado";

export const BUILTIN_SOUNDS: SoundOption[] = [
  { id: "classico", label: "Clássico", url: classico.url },
  { id: "bolha", label: "Bolha", url: bolha.url },
  { id: "sino", label: "Sino", url: sino.url },
  { id: "pop", label: "Pop", url: pop.url },
  { id: "suave", label: "Suave", url: suave.url },
];

export function builtinSoundUrl(id: string | null | undefined): string | null {
  if (!id) return null;
  return BUILTIN_SOUNDS.find((sound) => sound.id === id)?.url ?? null;
}
