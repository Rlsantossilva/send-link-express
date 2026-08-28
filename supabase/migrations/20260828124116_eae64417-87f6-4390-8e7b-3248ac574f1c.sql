CREATE OR REPLACE FUNCTION public.is_conversation_admin(_conversation_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members m
    WHERE m.conversation_id = _conversation_id AND m.user_id = _user_id AND m.is_admin
  ) OR EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = _conversation_id AND c.created_by = _user_id
  );
$$;
REVOKE ALL ON FUNCTION public.is_conversation_admin(uuid, uuid) FROM anon;

DROP POLICY IF EXISTS conversations_update_members ON public.conversations;
CREATE POLICY conversations_update_admins ON public.conversations FOR UPDATE TO authenticated
  USING (public.is_conversation_admin(id, auth.uid()))
  WITH CHECK (public.is_conversation_admin(id, auth.uid()));

DROP POLICY IF EXISTS members_insert ON public.conversation_members;
CREATE POLICY members_insert_admins ON public.conversation_members FOR INSERT TO authenticated
  WITH CHECK (public.is_conversation_admin(conversation_id, auth.uid()));

DROP POLICY IF EXISTS avatars_select_authenticated ON storage.objects;
CREATE POLICY avatars_select_related ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.profiles_are_related(((storage.foldername(name))[1])::uuid)
    )
  );