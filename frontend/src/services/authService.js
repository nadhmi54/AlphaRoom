import { supabase } from '../config/supabaseClient.js';

function requireSupabase() {
  if (!supabase) {
    throw new Error(
      "Connexion au serveur d'authentification impossible : configuration Supabase manquante (voir frontend/.env.example)."
    );
  }
  return supabase;
}

// Inscription par email/mot de passe. Par défaut, Supabase Auth envoie un
// email de confirmation avant d'activer le compte.
export async function signUpWithEmail(fullName, email, password) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) throw error;
  return data;
}

// Connexion par email/mot de passe.
export async function signInWithEmail(email, password) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// Connexion via Google (redirige vers Google puis revient sur l'app).
// Nécessite que le provider Google soit activé côté Supabase (Authentication
// > Providers) — sinon Supabase répond avec une erreur explicite.
export async function signInWithGoogle() {
  const supabase = requireSupabase();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
  return data;
}
