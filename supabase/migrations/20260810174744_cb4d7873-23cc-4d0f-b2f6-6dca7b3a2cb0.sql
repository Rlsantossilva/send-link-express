CREATE TABLE public.message_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delivered_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  UNIQUE (message_id, user_id)
);
GRANT SELECT, INSERT, UPDATE ON public.message_receipts TO authenticated;
GRANT ALL ON public.message_receipts TO service_role;
ALTER TABLE public.message_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY receipts_select_members ON public.message_receipts FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_id AND public.is_conversation_member(m.conversation_id, auth.uid())));

CREATE POLICY receipts_insert_own ON public.message_receipts FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_id AND public.is_conversation_member(m.conversation_id, auth.uid())));

CREATE POLICY receipts_update_own ON public.message_receipts FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.message_receipts;

CREATE TABLE public.blocked_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id)
);
GRANT SELECT, INSERT, DELETE ON public.blocked_users TO authenticated;
GRANT ALL ON public.blocked_users TO service_role;
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY blocked_manage_own ON public.blocked_users FOR ALL TO authenticated
USING (blocker_id = auth.uid()) WITH CHECK (blocker_id = auth.uid() AND blocked_id <> auth.uid());