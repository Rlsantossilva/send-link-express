DROP TABLE IF EXISTS public.zz_acl_test;

-- Required by RLS policies: Postgres checks EXECUTE on functions referenced in
-- policy expressions as the querying role. These helpers only ever answer
-- "is auth.uid() related to X?" and expose no data.
GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_is_for_me(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.profiles_are_related(uuid) TO authenticated;