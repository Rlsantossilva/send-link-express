ALTER TABLE public.contacts REPLICA IDENTITY FULL;
ALTER TABLE public.invites REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.invites;