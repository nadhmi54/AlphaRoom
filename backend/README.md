# AlphaRoom Backend (NestJS)

API backend du simulateur de salle de marché AlphaRoom. Remplace l'ancien
backend Spring Boot (Java), conservé pour référence dans
`../backend-java-legacy/`.

## Architecture

Ce backend ne stocke pas ses propres identifiants/sessions : **Supabase**
fournit PostgreSQL, l'authentification (JWT) et le temps réel. NestJS reste
l'endroit où vit la logique métier (validation des ordres, calcul du P&L,
règles de risque...) — voir le `Guide_Supabase_Simulateur_Salle_de_Marche`
partagé par l'équipe pour le détail du raisonnement.

Ce qui existe pour l'instant est uniquement la **plomberie technique** :

| Dossier | Rôle |
|---|---|
| `src/config` | Validation des variables d'environnement au démarrage |
| `src/database` | Connexion TypeORM vers PostgreSQL (Supabase ou local) |
| `src/health` | `GET /api/health` — health check |
| `src/auth` | `SupabaseJwtGuard` — vérifie les JWT émis par Supabase Auth |

Aucun module métier (marché, ordres, portefeuille, risque, IA...) n'est
encore implémenté — ils viendront se brancher dans `app.module.ts` au fur
et à mesure du développement des 6 modules fonctionnels du projet.

## Démarrage local

**1. Lancer Supabase en local** (nécessite Docker Desktop) :

```bash
cd .. # racine du repo
npx supabase start
```

La première fois, ça télécharge les images Docker de Supabase (peut prendre
quelques minutes). La commande affiche ensuite les clés/URLs locales — elles
correspondent déjà aux valeurs par défaut de `.env.example`.

**2. Configurer et lancer le backend :**

```bash
cp .env.example .env
npm install
npm run start:dev
```

L'API est servie sur `http://localhost:8080/api` (health check :
`http://localhost:8080/api/health`).

**Interface d'administration Supabase locale** (Studio) :
`http://localhost:54323`.

## Scripts

```bash
npm run start:dev   # démarrage avec rechargement à chaud
npm run build        # compilation TypeScript -> dist/
npm run lint         # oxlint
npm test             # tests unitaires (vitest)
npm run test:e2e     # tests e2e (nécessite une base accessible, voir .env)
```
