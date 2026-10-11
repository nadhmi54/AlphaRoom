# Module 2 — Intelligence de Marché Financière & IA

Moteur de risque de marché (simulation stochastique Monte Carlo, VaR,
Expected Shortfall, backtesting Kupiec) pour AlphaRoom. Sous-dossier Python
de `backend/`, à côté de `backend/src/` (NestJS) : runtime séparé (Python,
pas Node), développé et validé ici tant que la méthodologie n'est pas
stabilisée sur un premier actif (voir rapport de cadrage du module pour le
détail métier et les choix de conception).

## État actuel

Vertical slice sur l'or (XAU/USD) uniquement. Pas encore de conteneurisation
ni d'appel depuis l'API NestJS (`backend/src/`) — ce sera décidé une fois le
pipeline validé de bout en bout (prétraitement → calibration GBM → Monte
Carlo → VaR/ES → backtesting). L'architecture documentée à la racine du
projet montre l'API comme point d'entrée unique vers les données de marché
(Alpha Vantage + Kaggle) ; ce moteur Python sera appelé par l'API (passerelle
interne à définir — endpoint HTTP interne, child process, ou autre) plutôt
que remplacé par elle.

## Structure

```
data/raw/          CSV bruts, jamais modifiés directement (non versionnés, voir .gitignore racine)
data/processed/    Sorties du prétraitement (non versionné)
src/preprocessing/ Nettoyage et préparation des séries (rendements log, gestion des trous, outliers)
src/models/        Calibration GBM, moteur Monte Carlo
src/risk/          VaR (3 méthodes), Expected Shortfall, backtesting Kupiec
notebooks/         Exploration et validation
```

## Données

9 fichiers XAU/USD multi-timeframe (source : Kaggle, cf. architecture
documentée dans le README racine). Format `Date;Open;High;Low;Close;Volume`,
séparateur `;`.

Présents dans `data/raw/` : `1Month`, `1w`, `1d`, `4h`, `1h`, `30m`
(2004-06 à 2026-01). `15m`, `5m`, `1m` pas encore ajoutés (fichiers trop
volumineux pour le transfert automatique — à copier manuellement dans
`data/raw/` si besoin d'intraday plus fin).

Point d'attention déjà identifié sur `XAU_1d` : trou de données du
2025-09-12 au 2025-10-15 (confirmé à toutes les granularités), avec un
changement de régime de volume juste après (~×12) — probablement un
changement de fournisseur de données. À traiter explicitement dans le
prétraitement, pas à ignorer.

## Setup

Environnement Python séparé de celui de `backend/` (Node.js) — à créer côté
Windows, pas depuis cette VM Linux de pont :

```bash
cd backend/market-intelligence
python -m venv .venv
.venv\Scripts\activate      # Windows
pip install -r requirements.txt
```
