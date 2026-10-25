# Base de données — migrations Supabase

Le schéma est géré **uniquement** par les migrations de `supabase/migrations/`.
La synchronisation automatique de TypeORM est désactivée
(`synchronize: false` dans `backend/src/database/database.module.ts`) : elle
recréait les tables sans clés étrangères ni contraintes CHECK, ce qui a rendu le
schéma du projet Cloud différent des fichiers de migration.

## Appliquer les migrations

```bash
supabase link --project-ref <ref>   # une seule fois par poste
supabase migration list             # local vs distant
supabase db push                    # projet Cloud lié
```

En local (stack Docker de la CLI) :

```bash
supabase start
supabase migration up
```

## Historique des migrations

L'état « appliqué » est stocké dans `supabase_migrations.schema_migrations`.
Pour marquer une migration comme déjà appliquée sans la rejouer (par exemple
après l'avoir passée à la main dans le SQL Editor) :

```bash
supabase migration repair --status applied 20261024000000
```

C'est exactement l'équivalent d'un
`insert into supabase_migrations.schema_migrations (version, name) values (...)`.

## État du projet Cloud (`drwcelmntfyvjkovrhno`)

| Version | Nom | Statut |
| --- | --- | --- |
| `20261012000000` | `users_module` | appliquée |
| `20261023000000` | `update_roles` | appliquée |
| `20261024000000` | `trading_module` | appliquée (rattrapée le 25/10) |
| `20261024130000` | `trading_history_indexes` | appliquée (rattrapée le 25/10) |
| `20261025120000` | `schema_integrity` | appliquée |
| `20261025140000` | `order_book` | appliquée (rattrapée le 25/10) |

`20261025120000_schema_integrity.sql` rattrape l'écart entre le schéma réel et
les migrations : clés étrangères (`profiles` → `auth.users`, `trading_*` →
`profiles`), contraintes CHECK (rôle, cash, quantités, prix, sens) et index
d'historique. La migration est idempotente, elle ne fait rien sur une base
créée proprement.

`20261025140000_order_book.sql` ajoute le carnet d'ordres (table `orders`,
`trade_executions.order_id`, `order_book_marks`) et retire l'unicité
`(owner_id, request_id)` de `trade_executions` : un ordre partiellement exécuté
produit plusieurs exécutions, l'idempotence passe sur `orders`. Sur le projet
Cloud, cette unicité avait été créée par TypeORM sous forme d'**index** unique
et non de contrainte de table, d'où le `drop index if exists` en plus du
`drop constraint if exists`.

## Ajouter une migration

1. Créer `supabase/migrations/<timestamp>_<nom>.sql` (timestamp UTC, ex.
   `20261026100000_add_order_book.sql`).
2. Écrire du SQL idempotent quand c'est possible (`if not exists`,
   `do $$ ... $$`).
3. Mettre à jour les entités TypeORM dans le même commit.
4. `supabase db push`, puis vérifier avec `supabase migration list`.
