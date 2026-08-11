CREATE TABLE public.avatar_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  path text NOT NULL,
  caption text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX avatar_photos_user_idx ON public.avatar_photos (user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avatar_photos TO authenticated;
GRANT ALL ON public.avatar_photos TO service_role;
ALTER TABLE public.avatar_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "avatar_photos_select_related" ON public.avatar_photos FOR SELECT TO authenticated
  USING (public.profiles_are_related(user_id));
CREATE POLICY "avatar_photos_manage_own" ON public.avatar_photos FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.avatar_photo_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id uuid NOT NULL REFERENCES public.avatar_photos(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (photo_id, viewer_id)
);
GRANT SELECT, INSERT, DELETE ON public.avatar_photo_views TO authenticated;
GRANT ALL ON public.avatar_photo_views TO service_role;
ALTER TABLE public.avatar_photo_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "avatar_photo_views_own" ON public.avatar_photo_views FOR ALL TO authenticated
  USING (viewer_id = auth.uid()) WITH CHECK (viewer_id = auth.uid());

ALTER TABLE public.avatar_photos REPLICA IDENTITY FULL;
ALTER TABLE public.avatar_photo_views REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.avatar_photos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.avatar_photo_views;