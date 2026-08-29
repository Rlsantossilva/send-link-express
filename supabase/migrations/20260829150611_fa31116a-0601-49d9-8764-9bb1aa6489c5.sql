ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS banner_messages boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS banner_reactions boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sound_messages boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sound_reactions boolean NOT NULL DEFAULT true;