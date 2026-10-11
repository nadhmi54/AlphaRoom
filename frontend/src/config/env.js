// Point d'entrée unique pour les variables d'environnement Vite (VITE_*).
// Les composants et services importent depuis ici plutôt que de lire
// `import.meta.env` un peu partout dans le code.

export const API_URL = import.meta.env.VITE_API_URL || '/api';

// Supabase (Auth). En local : stack Supabase CLI (`npx supabase start`).
// En prod/staging : projet Supabase hébergé (Project Settings > API).
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
