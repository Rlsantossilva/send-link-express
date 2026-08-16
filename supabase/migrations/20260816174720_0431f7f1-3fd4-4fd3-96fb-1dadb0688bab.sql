REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
DROP TABLE IF EXISTS public.user_pins;