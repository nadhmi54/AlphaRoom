# Module M2 — Positions & répartition

Lit le portefeuille géré par le module trading et en tire trois choses :
les **positions** (ouvertes et fermées), le **P&L** latent et réalisé, et la
**répartition** du portefeuille avec une alerte de concentration.

Le module ne possède aucune table et n'écrit jamais dans celles du trading :
il lit `trading_portfolios`, `trading_positions`, `trade_executions` et `order_book_marks`.

## Routes

Toutes exigent `Authorization: Bearer <jeton Supabase>`.

| Méthode | Route | Description |
| --- | --- | --- |
| GET | `/api/portfolio/positions?status=open\|closed\|all` | Positions ouvertes valorisées, cycles fermés, résumé (défaut : `all`) |
| GET | `/api/portfolio/allocation` | Poids du cash et de chaque actif, alerte de diversification |

## Règles de calcul

- **Prix moyen** à l'achat : (qté × ancien prix moyen + montant acheté) ÷ nouvelle qté. Une vente ne le change pas.
- **P&L latent** : (prix actuel − prix moyen) × quantité détenue.
- **P&L réalisé** (à chaque vente) : (prix de vente − prix moyen) × quantité vendue.
- **Position fermée** : quantité revenue à 0. Racheter ensuite ouvre un **nouveau cycle**.
- **Rendement d'un cycle** : P&L réalisé ÷ coût des quantités vendues, en %.
- **Poids** : valeur de la ligne ÷ valeur totale (cash + positions). Le cash compte dans le total.
- **Alerte** : un actif investi au-dessus de **30 %** (seuil strict). Le cash ne déclenche jamais l'alerte.

Les formules reprennent celles du module de trading pour que les deux écrans
affichent les mêmes chiffres.

## Code

| Fichier | Rôle |
| --- | --- |
| `portfolio-math.ts` | Calculs purs (cycles, valorisation, répartition). Réutilisable par M6 : `computeWeights`, `weightAfterBuy`, `CONCENTRATION_THRESHOLD_PERCENT` |
| `price-source.ts` | Source unique des prix actuels : dernier prix du carnet d'ordres, sinon prix de démonstration. Si les prix simulés changent un jour, c'est le seul fichier à adapter |
| `positions.service.ts` | Lecture des tables et assemblage des réponses |
| `positions.controller.ts` | Routes protégées par `@Auth()` |

Le prix actuel d'un actif est le **dernier prix exécuté dans le carnet d'ordres**
(table `order_book_marks`), et le prix de démonstration tant qu'aucun échange n'a
eu lieu : c'est la même règle que le module trading, donc les deux écrans affichent
les mêmes valeurs. Une position achetée au prix du jour a un P&L latent nul tant que
le dernier prix n'a pas bougé.
