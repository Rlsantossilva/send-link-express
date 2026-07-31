REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.bump_conversation() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.is_conversation_member(UUID, UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(UUID, UUID) TO authenticated;