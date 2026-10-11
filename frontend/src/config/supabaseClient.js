import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './env.js';

// Client Supabase partagé par toute l'app (Auth pour l'instant — Realtime et
// les futures requêtes de données passeront aussi par lui).
//
// Important : createClient() lève une exception si l'URL/clé sont absentes.
// On ne veut PAS que ça arrive au chargement du module (sinon toute l'app —
// y compris la home page — plante en page blanche dès que .env manque, car
// les pages d'auth sont importées dans les routes). On construit donc le
// client seulement si la config est présente, et on avertit clairement en
// console sinon.
let client = null;

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  console.error(
    "[Supabase] Configuration manquante : crée frontend/.env à partir de " +
    "frontend/.env.example (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY), " +
    "puis relance `npm run dev`. L'inscription/connexion ne fonctionnera " +
    "pas tant que ce fichier n'existe pas."
  );
}

export const supabase = client;
