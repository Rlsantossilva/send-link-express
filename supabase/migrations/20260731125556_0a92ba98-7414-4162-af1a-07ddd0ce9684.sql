CREATE OR REPLACE FUNCTION public.invite_is_for_me(_email TEXT, _phone TEXT, _invitee UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _invitee = auth.uid()
    OR (_email IS NOT NULL AND lower(_email) = lower(COALESCE((SELECT email FROM public.profiles WHERE id = auth.uid()), '')))
    OR (_phone IS NOT NULL AND _phone = COALESCE((SELECT phone FROM public.profiles WHERE id = auth.uid()), ''));
$$;
REVOKE ALL ON FUNCTION public.invite_is_for_me(TEXT, TEXT, UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.invite_is_for_me(TEXT, TEXT, UUID) TO authenticated;

DROP POLICY "invites_select_involved" ON public.invites;
CREATE POLICY "invites_select_involved" ON public.invites FOR SELECT TO authenticated
  USING (inviter_id = auth.uid() OR public.invite_is_for_me(invitee_email, invitee_phone, invitee_id));

DROP POLICY "invites_update_involved" ON public.invites;
CREATE POLICY "invites_update_involved" ON public.invites FOR UPDATE TO authenticated
  USING (inviter_id = auth.uid() OR public.invite_is_for_me(invitee_email, invitee_phone, invitee_id))
  WITH CHECK (inviter_id = auth.uid() OR public.invite_is_for_me(invitee_email, invitee_phone, invitee_id));