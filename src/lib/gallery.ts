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

/**
 * IDs de usuários que têm foto nova que eu ainda não vi — usados para
 * fazer o avatar brilhar como uma estrela.
 */
export async function listGlowingUserIds(): Promise<string[]> {
  const userId = await requireUserId();
  const [{ data: photos, error }, { data: views, error: viewsError }] = await Promise.all([
    supabase.from("avatar_photos").select("id, user_id").neq("user_id", userId),
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
