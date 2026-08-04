-- 1) Relationship helper for profile visibility
CREATE OR REPLACE FUNCTION public.profiles_are_related(_other uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _other = auth.uid()
    OR EXISTS (SELECT 1 FROM public.contacts c WHERE c.owner_id = auth.uid() AND c.contact_id = _other)
    OR EXISTS (SELECT 1 FROM public.contacts c WHERE c.owner_id = _other AND c.contact_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.conversation_members a
      JOIN public.conversation_members b ON b.conversation_id = a.conversation_id
      WHERE a.user_id = auth.uid() AND b.user_id = _other
    );
$$;

-- 2) Restrict profile reads to self, contacts and conversation members
DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
CREATE POLICY profiles_select_related ON public.profiles
FOR SELECT TO authenticated
USING (public.profiles_are_related(id));

-- 3) Never expose identity documents through the API
REVOKE SELECT (cpf, birth_date, full_name) ON public.profiles FROM authenticated;
REVOKE SELECT (cpf, birth_date, full_name) ON public.profiles FROM anon;

-- 4) Minimal lookup RPC so users can find someone to invite/add without harvesting PII
CREATE OR REPLACE FUNCTION public.lookup_profile(_email text DEFAULT NULL, _phone text DEFAULT NULL)
RETURNS TABLE (id uuid, display_name text, avatar_url text, status_text text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.display_name, p.avatar_url, p.status_text
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND (
      (_email IS NOT NULL AND _email <> '' AND lower(p.email) = lower(_email))
      OR (_phone IS NOT NULL AND _phone <> '' AND p.phone = _phone)
    )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.lookup_profile(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lookup_profile(text, text) TO authenticated;

-- 5) Definer functions that are only used internally must not be callable from the API
REVOKE ALL ON FUNCTION public.bump_conversation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_conversation_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invite_is_for_me(text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.profiles_are_related(uuid) FROM PUBLIC, anon, authenticated;