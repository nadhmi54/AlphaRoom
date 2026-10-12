# Module User — authentification, profils, rôles, administration

Supabase Auth gère l'identité (inscription, mot de passe, Google, JWT). Le
backend NestJS **vérifie** le JWT et porte tout le métier AlphaRoom : profil,
rôle, statut, préférences, administration.

```
Frontend ──(login)──▶ Supabase Auth ──▶ JWT (access_token)
Frontend ──(Authorization: Bearer <JWT>)──▶ NestJS
   SupabaseJwtGuard  → signature / expiration du JWT
   ProfileGuard      → charge (ou crée) le profil, refuse un compte désactivé
   RolesGuard        → vérifie @Roles(...) avec le rôle stocké en base
```

## Protéger une route dans un autre module

```ts
import { Auth } from '../users/auth.decorator.js';
import { CurrentProfile } from '../users/current-profile.decorator.js';
import { UserRole } from '../users/user-role.enum.js';

@Auth()                              // connecté + compte actif
@Get('portfolio') mine(@CurrentProfile() me: Profile) { ... }

@Auth(UserRole.RISK_MANAGER)         // + rôle requis (admin n'est PAS implicite)
@Post('var') computeVar() { ... }
```

`UsersModule` est `@Global` : rien à importer.

## Rôles métier

`trader`, `analyst`, `trainer`, `game_master`, `risk_manager`, `admin`.
Rôle par défaut : `trader`. Le rôle est lu **en base** (table `profiles`), jamais
dans le JWT (son champ `role` vaut « authenticated » côté Supabase) ni déduit de
l'e-mail. Seul un admin peut le changer.

## API

| Méthode | Route | Accès | Rôle |
|---|---|---|---|
| GET | `/api/users/me` | connecté | profil (créé à la 1re connexion) |
| PATCH | `/api/users/me` | connecté | nom, pseudo, avatar (https), pays, préférences |
| GET | `/api/admin/users?page&limit&search&role&isActive` | admin | liste paginée |
| GET | `/api/admin/users/:id` | admin | détail |
| PATCH | `/api/admin/users/:id/role` | admin | `{ "role": "..." }` |
| PATCH | `/api/admin/users/:id/status` | admin | `{ "isActive": false }` |
| GET | `/api/admin/audit-logs?page&limit` | admin | journal des actions |

## Règles métier

- Pseudo unique (`409` s'il est pris), 3–30 caractères `a-z 0-9 _ . -`.
- Un admin ne peut pas modifier son propre rôle ni désactiver son propre compte.
- Le dernier administrateur actif ne peut être ni rétrogradé ni désactivé (`409`).
- Un compte désactivé reçoit `403` sur toutes les routes `@Auth()`.
- Chaque changement de rôle / statut est écrit dans `admin_audit_logs`.
- `role`, `isActive`, `email` ne sont jamais modifiables via `PATCH /users/me`.

## Premier administrateur

Aucun compte n'est admin automatiquement. Après la 1re connexion du compte :

```sql
update public.profiles set role = 'admin' where email = 'toi@exemple.com';
```

## Base de données

Migration : `supabase/migrations/20261012000000_users_module.sql` (tables
`profiles` et `admin_audit_logs`, RLS activée sans policy : seul le backend, via
la connexion Postgres, y accède). En local : `supabase db reset`. En dev,
TypeORM `synchronize` crée aussi les tables.

## Limites connues

- Vérification JWT en HS256 (`SUPABASE_JWT_SECRET`). Un projet Supabase passé aux
  clés de signature asymétriques (ES256/RS256) demanderait une vérification JWKS.
- Un compte désactivé garde un JWT Supabase valide jusqu'à son expiration, mais
  le backend le refuse immédiatement (ProfileGuard).
