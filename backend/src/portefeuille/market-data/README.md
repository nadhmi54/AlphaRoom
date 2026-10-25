# Marché en direct — prix en temps réel

Fournit un prix par actif **chaque seconde**, l'historique des courbes, et fait
suivre ce prix au carnet d'ordres et au portefeuille.

## D'où viennent les prix

| Actif | Source réelle | Remarque |
| --- | --- | --- |
| BTC/USD | Binance `btcusdt` | 24 h/24, sans clé |
| XAU/USD | Binance `paxgusdt` | PAXG = jeton adossé à une once d'or, suit l'or de près, ouvert le week-end |
| EUR/USD | Binance `eurusdt` | l'USDT vaut ~1 $ |
| AAPL | Finnhub (actions US) | clé gratuite `FINNHUB_API_KEY` ; sans clé ou hors séance → simulation |

**Mode hybride** : tant qu'un prix réel est arrivé dans les 20 dernières
secondes, on le suit (badge « En direct »). Sinon la simulation prend le relais
à partir du dernier prix réel (badge « Simulé ») : mouvement brownien géométrique,
volatilité propre à chaque actif, léger rappel vers le dernier prix réel.
Quand le flux revient, le prix réel reprend la main.

## Ce que fait le service chaque seconde

1. choisit le prix de chaque actif (réel ou simulé) ;
2. l'écrit dans `market_ticks` (migration `20261026100000_market_ticks.sql`) ;
3. toutes les 3 s, le recopie dans `order_book_marks.last_price` sous le même
   verrou que le carnet : la liquidité du carnet est reconstruite autour de ce
   prix et le P&L latent des positions suit la courbe. `last_trade_at` n'est
   pas modifié ;
4. toutes les 10 min, supprime les ticks de plus de 24 h.

Aucune clé n'arrive au navigateur : seul le backend se connecte aux fournisseurs.

## Routes (authentifiées)

| Route | Rôle |
| --- | --- |
| `GET /api/market/quotes` | prix actuel, source, variation et mini-courbe de chaque actif (lu en mémoire, sans SQL) |
| `GET /api/market/history?symbol=BTC/USD&range=5m\|1h\|24h` | courbe d'un actif (1 s, 10 s ou 5 min par point) |

## Configuration (`backend/.env`)

- `FINNHUB_API_KEY` : clé gratuite finnhub.io (jamais dans git).
- `MARKET_DATA_ENABLED=false` : coupe le service (prix fixes, comme avant).

Le service est coupé automatiquement pendant les tests (`NODE_ENV=test`).

## Vérifier que le flux réel marche

Au démarrage du backend, les journaux affichent par actif :
`BTC/USD : prix réel reçu` (flux Binance OK) ou `simulation (pas de flux réel)`.
