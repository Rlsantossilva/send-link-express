ALTER TABLE public.conversation_members ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS members_update_self ON public.conversation_members;
CREATE POLICY members_update_self ON public.conversation_members
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

GRANT SELECT, INSERT, DELETE ON public.message_reactions TO authenticated;
GRANT ALL ON public.message_reactions TO service_role;

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reactions_select_members ON public.message_reactions;
CREATE POLICY reactions_select_members ON public.message_reactions
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.messages m
  WHERE m.id = message_reactions.message_id
    AND public.is_conversation_member(m.conversation_id, auth.uid())
));

DROP POLICY IF EXISTS reactions_insert_own ON public.message_reactions;
CREATE POLICY reactions_insert_own ON public.message_reactions
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND EXISTS (
  SELECT 1 FROM public.messages m
  WHERE m.id = message_reactions.message_id
    AND public.is_conversation_member(m.conversation_id, auth.uid())
));

DROP POLICY IF EXISTS reactions_delete_own ON public.message_reactions;
CREATE POLICY reactions_delete_own ON public.message_reactions
FOR DELETE TO authenticated
USING (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;