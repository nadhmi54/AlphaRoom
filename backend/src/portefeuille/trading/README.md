# Module M1 — Marché, trading et portefeuille

Le module propose un portefeuille individuel doté de **100 000 USD virtuels**.
Les transactions restent simulées et les cotations sont fixes ; aucune donnée
de marché en direct ni aucun courtier ne sont utilisés.

## Actifs disponibles

| Symbole | Actif | Unité | Prix de démonstration |
| --- | --- | --- | ---: |
| XAU/USD | Or | once troy (oz) | 2 685,40 USD |
| EUR/USD | Euro/Dollar | EUR | 1,0834 USD |
| BTC/USD | Bitcoin | BTC | 67 500,00 USD |
| AAPL | Apple | action | 224,50 USD |

## Fonctionnalités

- Création automatique du portefeuille à la première consultation authentifiée.
- Achat/vente simulés avec contrôle du solde, des quantités et du montant minimum.
- Mise à jour atomique du cash, de la position et du journal d'exécution.
- Prix moyen pondéré, P&L latent et P&L réalisé par vente.
- Historique paginé et filtrable par actif, sens et dates.
- Statistiques globales : nombre d'ordres, P&L réalisé, trades gagnants/perdants,
  taux de réussite et évolution de la valeur totale estimée.
- Identifiant de requête idempotent pour éviter de compter deux fois une requête.
- Remise à zéro du compte (cash à 100 000 USD, positions et historique effacés).
- Dashboard rafraîchi automatiquement toutes les 5 secondes, sans rechargement.
- Routes protégées par l'authentification Supabase et le profil AlphaRoom.

## API

Toutes les routes nécessitent `Authorization: Bearer <Supabase access token>`.

| Méthode | Route | Description |
| --- | --- | --- |
| GET | `/api/trading/assets` | Liste des actifs simulés et cotations |
| GET | `/api/trading/quote?symbol=XAU%2FUSD` | Cotation d'un actif (sans symbole : liste complète) |
| GET | `/api/trading/portfolio` | Portefeuille, positions, statistiques et historique |
| POST | `/api/trading/orders/market` | Achat/vente simulé |
| POST | `/api/trading/portfolio/reset` | Remise à zéro : cash à 100 000 USD, positions et historique effacés |

Filtres facultatifs de l'historique : `symbol`, `side`, `from`, `to`, `page` et
`limit` (100 lignes maximum par page). Les statistiques sont calculées sur tout
l'historique, même quand un filtre est actif. Le taux de réussite compte les
ventes gagnantes parmi les ventes gagnantes ou perdantes ; les ventes à zéro
sont exclues du dénominateur.

## Base de données

La migration `20261024000000_trading_module.sql` crée les tables de portefeuille,
positions et exécutions. `20261024130000_trading_history_indexes.sql` ajoute des
index pour accélérer les filtres d'historique. Appliquer ces migrations sur
Supabase dans l'ordre, après les migrations du module utilisateurs.

Les prix sont fictifs et fixes : le P&L réalisé sera normalement nul tant que
les cours de démonstration restent fixes et qu'aucun frais n'est appliqué.
