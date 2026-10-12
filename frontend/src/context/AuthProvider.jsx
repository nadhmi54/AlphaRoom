import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../config/supabaseClient.js';
import { getMe, updateMe } from '../services/userService.js';
import { AuthContext } from './authContext.js';

// Source de vérité de la session : Supabase Auth gère le JWT (stockage,
// rafraîchissement) ; le profil applicatif (rôle, statut...) vient du backend
// via GET /users/me, qui vérifie ce même JWT.
export default function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [sessionReady, setSessionReady] = useState(!supabase);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession((current) => current ?? data.session);
      setSessionReady(true);
    });

    // Ne pas appeler d'API Supabase dans ce callback (risque de blocage) :
    // on se contente de mémoriser la session.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next);
      setSessionReady(true);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setProfileError(null);
      setProfileLoading(false);
      return undefined;
    }
    let active = true;
    setProfileLoading(true);
    getMe()
      .then((me) => {
        if (!active) return;
        setProfile(me);
        setProfileError(null);
      })
      .catch((error) => {
        if (!active) return;
        setProfile(null);
        setProfileError(error);
      })
      .finally(() => {
        if (active) setProfileLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, reloadKey]);

  const refreshProfile = useCallback(async () => setReloadKey((key) => key + 1), []);

  const updateProfile = useCallback(async (changes) => {
    const updated = await updateMe(changes);
    setProfile(updated);
    return updated;
  }, []);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const loading = !sessionReady || (Boolean(userId) && profileLoading && !profile);

  const value = useMemo(
    () => ({ session, profile, loading, profileError, refreshProfile, updateProfile, signOut }),
    [session, profile, loading, profileError, refreshProfile, updateProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
