CREATE TABLE public.avatar_photo_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  photo_id UUID NOT NULL REFERENCES public.avatar_photos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (photo_id, user_id, emoji)
);

GRANT SELECT, INSERT, DELETE ON public.avatar_photo_reactions TO authenticated;
GRANT ALL ON public.avatar_photo_reactions TO service_role;

ALTER TABLE public.avatar_photo_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Related users can view photo reactions"
ON public.avatar_photo_reactions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.avatar_photos p
    WHERE p.id = photo_id
      AND (p.user_id = auth.uid() OR public.profiles_are_related(p.user_id))
  )
);

CREATE POLICY "Users can add own photo reactions"
ON public.avatar_photo_reactions FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.avatar_photos p
    WHERE p.id = photo_id
      AND (p.user_id = auth.uid() OR public.profiles_are_related(p.user_id))
  )
);

CREATE POLICY "Users can remove own photo reactions"
ON public.avatar_photo_reactions FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE INDEX idx_avatar_photo_reactions_photo ON public.avatar_photo_reactions(photo_id);

ALTER TABLE public.avatar_photo_reactions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.avatar_photo_reactions;