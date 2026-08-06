GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.contacts TO authenticated;
GRANT ALL ON TABLE public.contacts TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.invites TO authenticated;
GRANT ALL ON TABLE public.invites TO service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE public.conversations TO authenticated;
GRANT ALL ON TABLE public.conversations TO service_role;

GRANT SELECT, INSERT, DELETE ON TABLE public.conversation_members TO authenticated;
GRANT ALL ON TABLE public.conversation_members TO service_role;

GRANT SELECT, INSERT, DELETE ON TABLE public.messages TO authenticated;
GRANT ALL ON TABLE public.messages TO service_role;