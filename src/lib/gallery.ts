import { supabase } from "@/integrations/supabase/client";
import { requireUserId } from "@/lib/chat";

export type AvatarPhoto = {
  id: string;
  user_id: string;
  path: string;
  caption: string | null;
  created_at: string;
};

/** Fotos da biblioteca de um avatar (mais recentes primeiro). */
export async function listAvatarPhotos(userId: string): Promise<AvatarPhoto[]> {
  const { data, error } = await supabase
    .from("avatar_photos")
    .select("id, user_id, path, caption, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AvatarPhoto[];
}

/** Janela de validade dos avisos: nada com mais de 48h continua notificando. */
export const ALERT_WINDOW_MS = 48 * 60 * 60 * 1000;

export function alertCutoffIso() {
  return new Date(Date.now() - ALERT_WINDOW_MS).toISOString();
}

/**
 * IDs de usuários que têm foto nova (últimas 48h) que eu ainda não vi — usados
 * para fazer o avatar brilhar como uma estrela.
 */
export async function listGlowingUserIds(): Promise<string[]> {
  const userId = await requireUserId();
  const [{ data: photos, error }, { data: views, error: viewsError }] = await Promise.all([
    supabase
      .from("avatar_photos")
      .select("id, user_id")
      .neq("user_id", userId)
      .gte("created_at", alertCutoffIso()),
    supabase.from("avatar_photo_views").select("photo_id").eq("viewer_id", userId),
  ]);
  if (error) throw error;
  if (viewsError) throw viewsError;
  const seen = new Set((views ?? []).map((view) => view.photo_id));
  const glowing = new Set<string>();
  for (const photo of photos ?? []) {
    if (!seen.has(photo.id)) glowing.add(photo.user_id);
  }
  return [...glowing];
}

/** Marca todas as fotos de alguém como vistas, apagando o brilho. */
export async function markGallerySeen(ownerId: string) {
  const userId = await requireUserId();
  if (ownerId === userId) return;
  const { data: photos, error } = await supabase
    .from("avatar_photos")
    .select("id")
    .eq("user_id", ownerId);
  if (error) throw error;
  if (!photos?.length) return;
  const { error: insertError } = await supabase
    .from("avatar_photo_views")
    .upsert(
      photos.map((photo) => ({ photo_id: photo.id, viewer_id: userId })),
      { onConflict: "photo_id,viewer_id", ignoreDuplicates: true },
    );
  if (insertError) throw insertError;
}

export async function uploadAvatarPhoto(file: File, caption?: string) {
  if (file.size > 8 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 8 MB");
  const userId = await requireUserId();
  const extension = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const path = `${userId}/gallery/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("avatars").upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw error;
  const { error: rowError } = await supabase.from("avatar_photos").insert({
    user_id: userId,
    path,
    caption: caption?.trim() ? caption.trim().slice(0, 140) : null,
  });
  if (rowError) throw rowError;
  return path;
}

export async function deleteAvatarPhoto(photo: AvatarPhoto) {
  const { error } = await supabase.from("avatar_photos").delete().eq("id", photo.id);
  if (error) throw error;
  await supabase.storage.from("avatars").remove([photo.path]);
}

/* ---------------- Miniatura da foto nova ---------------- */

export type GlowPreview = { photoId: string; path: string; userId: string };

/** Para cada usuário com novidade, a foto mais recente ainda não vista. */
export async function listGlowingPreviews(): Promise<Record<string, GlowPreview>> {
  const userId = await requireUserId();
  const [{ data: photos, error }, { data: views, error: viewsError }] = await Promise.all([
    supabase
      .from("avatar_photos")
      .select("id, user_id, path, created_at")
      .neq("user_id", userId)
      .gte("created_at", alertCutoffIso())
      .order("created_at", { ascending: false }),
    supabase.from("avatar_photo_views").select("photo_id").eq("viewer_id", userId),
  ]);
  if (error) throw error;
  if (viewsError) throw viewsError;
  const seen = new Set((views ?? []).map((view) => view.photo_id));
  const map: Record<string, GlowPreview> = {};
  for (const photo of photos ?? []) {
    if (seen.has(photo.id)) continue;
    if (map[photo.user_id]) continue;
    map[photo.user_id] = { photoId: photo.id, path: photo.path, userId: photo.user_id };
  }
  return map;
}

/* ---------------- Reações nas fotos ---------------- */

export type PhotoReaction = {
  id: string;
  photo_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

export async function listPhotoReactions(photoIds: string[]): Promise<PhotoReaction[]> {
  if (photoIds.length === 0) return [];
  const { data, error } = await supabase
    .from("avatar_photo_reactions")
    .select("id, photo_id, user_id, emoji, created_at")
    .in("photo_id", photoIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PhotoReaction[];
}

export async function togglePhotoReaction(photoId: string, emoji: string) {
  const userId = await requireUserId();
  const { data: existing, error } = await supabase
    .from("avatar_photo_reactions")
    .select("id")
    .eq("photo_id", photoId)
    .eq("user_id", userId)
    .eq("emoji", emoji)
    .maybeSingle();
  if (error) throw error;
  if (existing) {
    const { error: deleteError } = await supabase
      .from("avatar_photo_reactions")
      .delete()
      .eq("id", existing.id);
    if (deleteError) throw deleteError;
    return "removed" as const;
  }
  const { error: insertError } = await supabase
    .from("avatar_photo_reactions")
    .insert({ photo_id: photoId, user_id: userId, emoji });
  if (insertError) throw insertError;
  return "added" as const;
}

/** Nomes de quem reagiu (para exibir nas notificações e chips). */
export async function listReactorNames(userIds: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return {};
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .in("id", unique);
  if (error) return {};
  const map: Record<string, string> = {};
  for (const profile of data ?? []) {
    map[profile.id] = profile.display_name || profile.email || "Alguém";
  }
  return map;
}

export type PhotoReactionAlert = {
  photoId: string;
  path: string;
  total: number;
  emojis: string[];
  names: string[];
  lastAt: string;
};

/** Reações que outras pessoas deixaram nas MINHAS fotos. */
export async function listMyPhotoReactionAlerts(): Promise<PhotoReactionAlert[]> {
  const userId = await requireUserId();
  const { data: photos, error } = await supabase
    .from("avatar_photos")
    .select("id, path")
    .eq("user_id", userId);
  if (error) throw error;
  if (!photos?.length) return [];
  const reactions = await listPhotoReactions(photos.map((photo) => photo.id));
  const cutoff = Date.now() - ALERT_WINDOW_MS;
  const mine = reactions.filter(
    (reaction) =>
      reaction.user_id !== userId && new Date(reaction.created_at).getTime() >= cutoff,
  );
  if (mine.length === 0) return [];
  const names = await listReactorNames(mine.map((reaction) => reaction.user_id));
  const grouped = new Map<string, PhotoReaction[]>();
  for (const reaction of mine) {
    const list = grouped.get(reaction.photo_id) ?? [];
    list.push(reaction);
    grouped.set(reaction.photo_id, list);
  }
  return [...grouped.entries()]
    .map(([photoId, list]) => ({
      photoId,
      path: photos.find((photo) => photo.id === photoId)?.path ?? "",
      total: list.length,
      emojis: [...new Set(list.map((reaction) => reaction.emoji))],
      names: [...new Set(list.map((reaction) => names[reaction.user_id] ?? "Alguém"))],
      lastAt: list[list.length - 1]!.created_at,
    }))
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}
