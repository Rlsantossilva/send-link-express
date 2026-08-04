CREATE TABLE IF NOT EXISTS public.zz_acl_test (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
GRANT SELECT ON public.zz_acl_test TO anon;
ALTER TABLE public.zz_acl_test ENABLE ROW LEVEL SECURITY;
CREATE POLICY zz_acl_test_select ON public.zz_acl_test FOR SELECT TO anon USING (public.profiles_are_related(id));