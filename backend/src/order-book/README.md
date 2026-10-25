# Moteur du carnet d'ordres (M1)

Le carnet est le **moteur d'exécution** de M1 : il décide qui s'apparie et à
quel prix, puis délègue la comptabilité au portefeuille. Il ne remplace pas la
page de marché, il la sert.

## Règles d'appariement

- **Un carnet global par actif** : tous les comptes s'apparient contre le même
  carnet, mais un compte ne peut pas s'auto-apparier (ses propres ordres sont
  ignorés, l'ordre entrant passe au prix suivant).
- **Priorité prix, puis temps** : les ventes du prix le plus bas au plus haut,
  les achats du prix le plus haut au plus bas ; à prix égal, le premier arrivé
  passe en premier (`orders.seq`, une identité Postgres — `created_at` ne suffit
  pas car `now()` est identique pour deux ordres d'une même transaction).
- **Le prix exécuté est celui de l'ordre présent dans le carnet** (le *maker*),
  jamais celui de l'ordre entrant : une vente limite à 1 998 $ contre un achat
  à 2 003 $ est exécutée à 2 003 $.
- **Ordre au marché** : consomme le carnet du meilleur prix au plus mauvais,
  sans condition de prix ; le reliquat non servi est annulé immédiatement.
- **Ordre limite** : ne s'exécute que si le prix croise le carnet ; le reliquat
  reste en attente et peut être annulé.
- Exemple de référence : acheter 15 oz alors qu'il y a 8 oz à 2 001 $ et 10 oz à
  2 002 $ donne 8 oz à 2 001 $ + 7 oz à 2 002 $, soit un prix moyen de 2 001,47 $
  (VWAP des exécutions).

## Écriture : un seul chemin

`OrderBookService.placeOrder()` fait tout dans **une transaction SQL** : verrou
consultatif par actif, contrôle d'idempotence, appariement, comptabilisation,
mise à jour du carnet, marquage du dernier prix. Un ordre est donc traité
entièrement ou pas du tout.

Chaque exécution produit une ligne `trade_executions` **par partie** (acheteur
et vendeur), rattachée à son ordre (`order_id`). M1 (cash), M2 (positions) et M5
(historique) lisent tous cette table. `TradingService.applyFill()` est le seul
point d'écriture du cash et des positions ; il verrouille le portefeuille
(`select ... for update`) pour que deux exécutions simultanées ne lisent pas le
même solde.

## Idempotence

La clé est le `requestId` de **l'ordre**, pas de l'exécution : un ordre
partiellement exécuté produit plusieurs exécutions avec le même `requestId`.
D'où `orders (owner_id, request_id)` en unique et la suppression de l'ancienne
unicité de `trade_executions`.

## Liquidité système

Sans contrepartie, un compte seul ne pourrait jamais traiter. Le carnet
maintient donc des ordres `owner_id is null` (le « reste du marché ») : 4
niveaux de chaque côté, espacés de 0,05 % autour du dernier prix exécuté,
~20 000 USD par niveau. Ces ordres n'ont pas de contrepartie comptable : seule
leur quantité diminue.

La grille est reconstruite dès qu'elle ne correspond plus aux prix attendus
autour du dernier prix, pour ne pas accumuler de niveaux obsolètes.

## Dernier prix (`order_book_marks`)

Chaque exécution enregistre son prix. M1 valorise les positions avec ce dernier
prix (et retombe sur le prix de démonstration de `market-assets.ts` tant qu'aucun
trade n'a eu lieu), sinon le portefeuille resterait figé au prix fixe et le
rendement affiché serait faux.

## API

Toutes les routes exigent `Authorization: Bearer <Supabase access token>`.

| Méthode | Route | Rôle |
| --- | --- | --- |
| GET | `/api/orders/book?symbol=XAU%2FUSD&depth=12` | Photo du carnet : bids, asks, spread, dernier prix |
| GET | `/api/orders?status=open` | Ordres du compte, les plus récents d'abord |
| POST | `/api/orders` | Passer un ordre `market` ou `limit` |
| DELETE | `/api/orders/:id` | Annuler un ordre encore en attente |
| POST | `/api/trading/orders/market` | Ancienne route, conservée pour le formulaire M1 : délègue au même moteur |

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `matching.ts` | Cœur pur (prix/FIFO, partiels, arrondis, niveaux, spread) — testé seul |
| `matching.spec.ts` | 24 tests, dont l'exemple du cahier des charges |
| `order-book.service.ts` | Orchestration, liquidité, idempotence, annulation |
| `order.entity.ts`, `order-book-mark.entity.ts` | Entités TypeORM |
| `dto/` | Validation des entrées (`class-validator`) |

L'interface se trouve dans `frontend/src/pages/Modules/M1Marche/OrderBook/`
(composant autonome, branché sur la page M1).
