-- Mise à jour des rôles : on conserve uniquement trader, game_master et admin.
-- Supprime la contrainte existante si elle existe, puis la recrée.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

UPDATE public.profiles
  SET role = 'trader'
  WHERE role NOT IN ('trader', 'game_master', 'admin');

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('trader', 'game_master', 'admin'));
