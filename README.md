<div align="center">

# AlphaRoom

### Simulateur de Salle de Marché

*Projet de Fin d'Études — ESPRIT *

[![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-12-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%7C%20Auth-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![GitHub Actions](https://img.shields.io/badge/CI%2FCD-GitHub%20Actions-2088FF?logo=githubactions&logoColor=white)](https://github.com/features/actions)
[![SonarCloud](https://img.shields.io/badge/Code%20Quality-SonarCloud-F3702A?logo=sonarcloud&logoColor=white)](https://sonarcloud.io/)
[![Nginx](https://img.shields.io/badge/Reverse%20Proxy-Nginx-009639?logo=nginx&logoColor=white)](https://nginx.org/)

</div>

---

## Sommaire

- [À propos du projet](#à-propos-du-projet)
- [Équipe](#équipe)
- [Modules fonctionnels](#modules-fonctionnels)
- [Actifs couverts](#actifs-couverts)
- [Architecture](#architecture)
- [Stack technique](#stack-technique)
- [Structure du dépôt](#structure-du-dépôt)
- [Démarrage rapide](#démarrage-rapide)
- [Docker & Supabase](#docker--supabase)
- [Workflow Git & scripts](#workflow-git--scripts)
- [Pipeline CI/CD](#pipeline-cicd)
- [Gouvernance & sécurité](#gouvernance--sécurité)

---

## À propos du projet

**AlphaRoom** est un simulateur de salle de marché développé dans le cadre du Projet à l'**ESPRIT** (École Supérieure Privée d'Ingénierie
et de Technologies).

Une salle de marché (*trading room*) est l'environnement dans lequel une banque ou une
institution financière réalise, suit et contrôle des opérations sur les marchés financiers.
Elle regroupe des métiers qui travaillent ensemble : **Trader** (exécute les opérations et
gère les positions), **Sales** (interagit avec les clients), **Risk Manager** (surveille les
risques et les limites), **Analyste** (analyse marchés et actualités) et **IT/Admin** (gère
la plateforme, les utilisateurs, les marchés et les scénarios).

AlphaRoom reproduit cet environnement sous forme d'un simulateur interactif et pédagogique,
permettant aux utilisateurs — nouveaux traders comme professionnels — de s'exercer au
trading, à la gestion de portefeuille et à l'évaluation des risques, tout en s'appuyant sur
l'intelligence artificielle pour la prédiction, l'aide à la décision et l'explicabilité (XAI).

Le nom **AlphaRoom** fait référence à l'*alpha*, la surperformance qu'un trader ou un modèle
cherche à générer, combiné à la *room* (salle de marché) — et fait aussi un clin d'œil à
**Alpha Vantage**, l'une des sources de données de marché utilisées par le projet.

## Équipe

Projet réalisé par :

| Membre |
|---|
| Nadhmi Rouissi |
| Haroun Chebaane |
| Youssef Mellouli |
| Safwen Haboubi |
| Chahine Saadellaoui |
| Ghassen Hamdi |

## Modules fonctionnels

Le projet est découpé en **6 modules complémentaires**, chacun rattaché à un métier
explicite, en évitant les chevauchements entre fonctionnalités.

| # | Module | Domaine | Métier principal |
|---|---|---|---|
| 1 | **Marché, Trading & Gestion du Portefeuille** | Trading / Gestion | Trader / Portfolio Manager |
| 2 | **Intelligence de Marché Financière & IA** | Analyse / IA | Analyste financier / Data Scientist |
| 3 | **Formation, Pédagogie & Engagement** | Formation | Formateur / Apprenant |
| 4 | **Meneur de Jeu & Simulation Historique** | Simulation / Gamification | Game Master / Trader |
| 5 | **Stress Testing Bancaire** | Risque bancaire / IA | Risk Manager / Data Scientist |
| 6 | **Actuariat & Risque d'Assurance** | Assurance / IA | Actuaire / Data Scientist |

> ℹ️ L'**authentification**, la **sécurité informatique** et l'**administration** ne
> constituent plus des modules du projet. Elles restent des fonctionnalités techniques
> **transversales** de l'application, nécessaires à l'implémentation, mais elles ne font
> pas partie des six domaines fonctionnels principaux.

### Détail des modules

<details>
<summary><strong>📈 Module 1 — Marché, Trading & Gestion du Portefeuille</strong></summary>

**🎯 Objectif**
Permettre à l'utilisateur de consulter le marché, effectuer des opérations de trading
simulées et gérer son portefeuille virtuel.

**💼 Métier concerné** : Trader / Portfolio Manager / Risk Manager

**Fonctionnalités**
- Données de marché, consultation des prix et évolutions
- Ordres Market / Limit / Stop
- Exécution simulée des ordres
- Gestion des positions et du portefeuille virtuel
- Gestion du cash
- Calcul du P&L
- Allocation du portefeuille
- Calcul de l'exposition
- Stop-loss / Take-profit
- Gestion du risque avant et après une transaction

**Exemple** : le trader dispose de 100 000 € virtuels → il consulte le prix d'un actif →
passe un ordre d'achat → l'ordre est simulé → la position apparaît dans son portefeuille →
le P&L et l'exposition sont recalculés.

**❓ Question principale** : *Comment trader et gérer son portefeuille ?*

</details>

<details>
<summary><strong>🤖 Module 2 — Intelligence de Marché Financière & IA</strong></summary>

**🎯 Objectif**
Analyser les marchés financiers et utiliser l'intelligence artificielle pour aider
l'utilisateur dans sa prise de décision.

**💼 Métier concerné** : Analyste financier / Trader / Data Scientist / AI Engineer

**Fonctionnalités**
- Analyse technique — indicateurs RSI, MACD, SMA, EMA, etc.
- Analyse historique et backtesting
- Comparaison des stratégies
- Prédiction des tendances
- Recommandations basées sur l'IA
- Agent intelligent de trading
- Analyse du sentiment des actualités financières
- Détection de tendances
- Explication des résultats de l'IA (XAI)

**Exemple** : l'utilisateur choisit une stratégie → le système la teste sur des données
historiques → calcule ses performances → l'IA analyse les tendances actuelles → elle
fournit une analyse et des recommandations explicatives.

**❓ Question principale** : *Comment analyser le marché et utiliser l'IA pour aider à la
décision ?*

</details>

<details>
<summary><strong>🎓 Module 3 — Formation, Pédagogie & Engagement</strong></summary>

**🎯 Objectif**
Permettre aux utilisateurs d'apprendre progressivement le trading et la finance, de
pratiquer leurs connaissances et de suivre leur progression. Ce module reste volontairement
consacré à la pédagogie, sans intégrer le Meneur de Jeu (Module 4).

**💼 Métier concerné** : Formateur financier / Responsable pédagogique / Apprenant

**Fonctionnalités**

*📚 Formation*
- Formations interactives, cours sur le trading
- Explication des différents actifs et des indicateurs financiers
- Notions de gestion du risque et de marché financier

*🧪 Exercices*
- Exercices pratiques de trading, de gestion du portefeuille, de gestion du risque
- Cas pratiques

*📝 Évaluation*
- Quiz, évaluations, questions à choix multiples
- Évaluation du niveau de l'utilisateur

*🏆 Engagement*
- Défis, concours, niveaux, badges
- Suivi de progression, classement pédagogique

**Exemple** : un débutant suit une formation sur les marchés financiers → apprend le
fonctionnement des ordres → réalise un exercice → répond à un quiz → obtient un score →
débloque le niveau suivant.

**❓ Question principale** : *Comment apprendre le trading et la finance de manière
interactive ?*

</details>

<details>
<summary><strong>🎮 Module 4 — Meneur de Jeu & Simulation Historique</strong></summary>

**🎯 Objectif**
Permettre à un meneur de jeu de créer des espaces de simulation basés sur des données
historiques réelles, dans lesquels les joueurs prennent des décisions comme s'ils se
trouvaient réellement à une période donnée. L'objectif est de transformer le simulateur en
jeu de marché réaliste, où le joueur ne connaît pas les événements futurs.

**💼 Métier concerné** : Trader / Game Master / Analyste financier / Formateur

**Fonctionnalités**

*🗓️ Création d'une partie* — le meneur de jeu peut :
- Choisir une période historique (ex. 2014→2015, 2018→2020, 2020→2022, 2022→2025)
- Choisir une date de départ et une date de fin
- Choisir un ou plusieurs actifs, définir le capital initial
- Créer un espace de jeu, définir les règles et les objectifs

*📊 Données historiques* — le système utilise les données réelles de marché correspondant
à la période choisie ; le joueur ne voit que les informations disponibles à la date
simulée.

*🎲 Déroulement du jeu* — à chaque étape (le temps avance mois par mois), le joueur peut
acheter, vendre, conserver, modifier son portefeuille, gérer son capital et contrôler son
exposition, sans connaître les données futures.

*🏆 Résultat et score* — à la fin de la simulation, le système calcule : capital initial,
capital final, gains/pertes, performance, nombre de transactions, niveau de risque,
drawdown, respect des limites et score final. Possibilité d'ajouter classement, challenges,
compétitions et niveaux de difficulté.

**Exemple de résultat**

| Indicateur | Résultat |
|---|---|
| Capital initial | 100 000 € |
| Capital final | 117 500 € |
| Gain | +17 500 € |
| Performance | +17,5 % |
| Transactions | 24 |
| Score | 860 / 1000 |

**❓ Question principale** : *Comment faire vivre à un utilisateur une situation
historique de marché et évaluer ses décisions ?*

**🔎 Différence avec le Module 2** :
- Module 2 — Backtesting : *« Si j'avais utilisé cette stratégie dans le passé, quel
  aurait été le résultat ? »*
- Module 4 — Meneur de Jeu : *« Tu es en 2014. Tu ne connais pas le futur. Quelle décision
  vas-tu prendre ? »*

Le Module 4 est donc une simulation interactive, tandis que le Module 2 est principalement
consacré à l'analyse et au backtesting.

</details>

<details>
<summary><strong>🏦 Module 5 — Stress Testing Bancaire</strong></summary>

**🎯 Objectif**
Évaluer la capacité d'une banque à résister à différentes situations de crise financière.

**💼 Métier concerné** : Risk Manager / Analyste risque bancaire / Data Scientist

**Fonctionnalités**
- Génération de scénarios de crise (hausse des taux d'intérêt, baisse des marchés,
  récession, hausse du chômage, hausse des défauts, dégradation de la qualité des actifs)
- Analyse des banques conventionnelles et non conventionnelles (islamiques)
- Modèles Machine Learning / Deep Learning
- Estimation des pertes, évaluation de la résilience
- Comparaison des scénarios
- Identification des facteurs contribuant aux pertes

**Exemple** : on crée un scénario → hausse des taux de +3 % → baisse de la valeur des
actifs → augmentation des défauts → augmentation des pertes → évaluation de l'impact sur
la banque. L'IA peut être utilisée pour prévoir certains indicateurs et identifier les
facteurs qui contribuent aux pertes.

**❓ Question principale** : *Comment une banque résiste-t-elle à une crise ?*

</details>

<details>
<summary><strong>🛡️ Module 6 — Actuariat & Risque d'Assurance</strong></summary>

**🎯 Objectif**
Modéliser et analyser les risques liés aux activités d'assurance.

**💼 Métier concerné** : Actuaire / Analyste assurance / Data Scientist

**Fonctionnalités**
- Modélisation des produits d'assurance, prédiction des primes
- Calcul de la marge de prime
- Estimation de la probabilité de sinistre et du montant des indemnisations
- Provisionnement des sinistres
- Analyse des risques assurantiels
- Simulation de scénarios de sinistres

**🤖 Partie IA** — le Machine Learning peut être utilisé pour prédire :
- La probabilité qu'un sinistre survienne
- Le montant potentiel de l'indemnisation
- Le montant des primes
- Les provisions nécessaires

**Exemple** : données d'un contrat d'assurance → modèle prédictif → probabilité de
sinistre → estimation du coût du sinistre → aide au calcul de la prime / provision.

**❓ Question principale** : *Comment modéliser et prévoir les risques liés à
l'assurance ?*

</details>

### Comment les modules sont liés

**Parcours Trading** : Données de marché → **M1** (Trading & Portefeuille) → **M2**
(Analyse financière & IA) → **M4** (Simulation historique) → Résultat + Performance +
Score.

**Parcours pédagogique** : **M3** (Formation) → Cours → Exercices → Quiz → Progression →
Défis / Concours. Le module pédagogique peut ensuite utiliser les autres modules pour
proposer des exercices pratiques.

**Parcours Risque bancaire** : Données financières → **M5** (Stress Testing) → Scénarios
de crise → Pertes estimées → Résilience bancaire.

**Parcours Assurance** : Données de contrats / sinistres → **M6** (Actuariat) → Modèles
prédictifs → Probabilité de sinistre → Coût / Prime / Provision.

### Résumé des responsabilités

| Module | Rôle | En une phrase |
|---|---|---|
| M1 | Trader | Je consulte le marché, je trade et je gère mon portefeuille. |
| M2 | Analyste / IA | J'analyse le marché et j'utilise l'IA pour aider à la décision. |
| M3 | Formateur | J'enseigne la finance et le trading de manière interactive. |
| M4 | Meneur de jeu | Je crée une situation historique et je fais jouer les utilisateurs dans les conditions de l'époque. |
| M5 | Risk Manager | Je teste la résistance d'une banque face à différents scénarios de crise. |
| M6 | Actuaire | Je modélise et je prévois les risques liés à l'assurance. |

## Actifs couverts

Pour garder un périmètre réaliste tout en couvrant plusieurs classes d'actifs citées dans
le cahier des charges (*actions, obligations, matières premières et devises*), AlphaRoom
s'appuie sur un panier restreint :

| Classe | Actif | Justification |
|---|---|---|
| Matière première | **Or (XAU/USD)** | Actif pivot : réserve de valeur bancaire, actif de référence en finance islamique (Mourabaha/Ijara/Sukuk, AAOIFI n°57), actif de couverture en assurance/Takaful |
| Matière première | **Argent (XAG/USD)** | Même source de données que l'or (Alpha Vantage), également un bien *Ribawi* en finance islamique |
| Matière première | **Pétrole (WTI/Brent)** | Choc macroéconomique classique pour les scénarios de stress testing |
| Devise | **EUR/USD** | Paire de référence, directement liée aux scénarios de hausse des taux d'intérêt |
| Action | **S&P 500** | Représente le risque marché actions dans les scénarios de stress testing |

## Architecture

```mermaid
flowchart LR
    subgraph Client
        U[Utilisateur]
    end

    subgraph Frontend["Frontend — React (Vite)"]
        FE[SPA React]
        NG[Nginx]
    end

    subgraph Backend["Backend — NestJS"]
        API[API REST]
    end

    subgraph Supa["Supabase"]
        SDB[(PostgreSQL)]
        SAUTH[Auth — JWT]
        SRT[Realtime]
    end

    subgraph Data["Données de marché"]
        AV[Alpha Vantage API]
        KG[Datasets Kaggle]
    end

    subgraph CICD["CI/CD — GitHub Actions"]
        CI[Build + Tests + Sonar]
        DK[Build & Push images Docker]
        CD[Déploiement]
    end

    U --> NG --> FE
    FE -->|/api| NG -->|reverse proxy| API
    FE -.->|Auth directe| SAUTH
    API --> SDB
    API --> SAUTH
    API --> SRT
    API --> AV
    API --> KG
    CI --> DK --> CD
```

Le frontend React est servi par Nginx, qui fait aussi office de reverse proxy vers l'API
NestJS (`/api/*`). Le backend expose les données de marché et la logique métier des 6
modules (trading, portefeuille, risque, IA, simulation, stress testing, actuariat), et
consomme Alpha Vantage (temps quasi réel) et les datasets Kaggle (historique pour le
backtesting et l'entraînement IA). **Supabase** fournit la base **PostgreSQL** managée,
l'**authentification** (JWT vérifiés côté NestJS via un guard dédié) et le **Realtime**
pour les mises à jour en direct (cotations, portefeuille). L'ensemble applicatif
(backend + frontend) est containerisé et déployé via un pipeline GitHub Actions (build,
tests, analyse Sonar, images Docker, déploiement).

## Stack technique

| Couche | Technologies |
|---|---|
| Backend | Node.js 20, NestJS 12, TypeORM |
| Frontend | React 18, Vite, ESLint, Vitest + Testing Library |
| Backend-as-a-Service | **Supabase** (PostgreSQL 16 managé, Auth, Realtime) — via la CLI en local, projet hébergé en staging/prod |
| Conteneurisation | Docker (multi-stage), Docker Compose (backend + frontend) |
| Serveur web / reverse proxy | Nginx |
| CI/CD | GitHub Actions |
| Qualité de code | SonarCloud (SonarQube), couverture Vitest (backend), lcov (couverture frontend) |
| Registre d'images | GitHub Container Registry (GHCR) |
| Sources de données marché | Alpha Vantage API, datasets Kaggle (historique XAU/USD, actifs corrélés) |

## Structure du dépôt

```
AlphaRoom/
├── .github/
│   └── workflows/
│       └── ci.yml              # Pipeline CI/CD (build, tests, Sonar, Docker, deploy)
├── backend/                    # API NestJS (Node.js 20)
│   ├── src/
│   │   ├── config/              # Validation des variables d'environnement
│   │   ├── database/            # Connexion TypeORM (Supabase Postgres)
│   │   ├── health/               # GET /api/health
│   │   └── auth/                 # Guard JWT Supabase
│   ├── test/
│   ├── package.json
│   ├── .env.example
│   └── Dockerfile
├── frontend/                   # Application React (Vite)
│   ├── src/
│   ├── package.json
│   ├── Dockerfile
│   ├── nginx.conf
│   └── sonar-project.properties
├── supabase/
│   └── config.toml             # Configuration de la stack Supabase locale (CLI)
├── docker-compose.yml          # Environnement local : backend + frontend
├── new-push.sh / new-push.bat  # Crée une branche, commit initial, push
├── update.sh / update.bat      # Bascule sur main et récupère les derniers changements
└── README.md
```

## Démarrage rapide

**Prérequis :** Docker Desktop installé et lancé (pour le backend/frontend et pour la
stack Supabase locale).

```bash
git clone https://github.com/nadhmi54/AlphaRoom.git
cd AlphaRoom

# 1. Démarrer Supabase en local (Postgres + Auth + Realtime)
npx supabase start

# 2. Configurer le backend (les valeurs par défaut de .env.example
#    correspondent déjà à la stack Supabase locale)
cp backend/.env.example backend/.env

# 3. Démarrer le backend + le frontend
docker compose up --build
```

- Frontend : http://localhost:8081
- Backend (health check) : http://localhost:8080/api/health
- Supabase Studio (admin base de données / auth, local) : http://localhost:54323

## Docker & Supabase

Depuis le passage à Supabase, **PostgreSQL, l'authentification et le realtime ne sont plus
gérés par un conteneur `db` custom** dans `docker-compose.yml` : ils sont fournis par
Supabase, soit via sa propre stack Docker locale (CLI), soit via un projet Supabase
hébergé en staging/production.

`docker-compose.yml` orchestre donc uniquement les deux services applicatifs :
`backend` (NestJS) et `frontend` (React servi par Nginx).

### Lancer la stack Supabase locale

```bash
npx supabase start   # première fois : télécharge les images Docker (peut prendre quelques minutes)
npx supabase status  # ré-affiche les URLs et clés locales
npx supabase stop    # arrêter la stack Supabase locale
```

La commande affiche les URLs/clés locales (Postgres sur le port `54322`, API sur
`54321`, Studio sur `54323`) — elles correspondent déjà aux valeurs par défaut de
`backend/.env.example`.

### Lancer le backend et le frontend

```bash
docker compose up --build
```

Ajoute `-d` pour lancer en arrière-plan :

```bash
docker compose up --build -d
```

### Commandes utiles

```bash
# Voir l'état des conteneurs
docker compose ps

# Suivre les logs (tous les services, ou un seul)
docker compose logs -f
docker compose logs -f backend

# Arrêter les conteneurs
docker compose stop

# Arrêter et supprimer les conteneurs
docker compose down

# Reconstruire une image après modification du code
docker compose build backend
docker compose build frontend
```

### Se connecter à la base de données

- **En local** : `npx supabase status` affiche l'URL de connexion directe à Postgres
  (`postgresql://postgres:postgres@localhost:54322/postgres` par défaut), ou utilise
  **Supabase Studio** (http://localhost:54323) pour une interface graphique.
- **En staging/production** : identifiants disponibles dans *Project Settings → API* du
  tableau de bord Supabase du projet — jamais commités, voir `backend/.env.example`.

> ⚠️ Le backend tournant à l'intérieur d'un conteneur Docker ne peut pas joindre la stack
> Supabase locale via `localhost` (qui, dans le conteneur, désigne le conteneur
> lui-même) : utiliser `host.docker.internal` à la place. Voir les commentaires dans
> `backend/.env.example`.

### Relancer le backend seul après une modification

```bash
docker compose up --build backend
```

## Workflow Git & scripts

Le dépôt fournit deux paires de scripts (`.sh` pour Git Bash/Linux/Mac, `.bat` pour
PowerShell/CMD) qui automatisent le flux de travail Git de l'équipe.

### `new-push` — démarrer une nouvelle fonctionnalité

À utiliser **une seule fois par nouvelle branche/fonctionnalité**. Le script crée la
branche, fait un commit initial et la pousse sur `origin`.

```powershell
.\new-push.bat
```
```bash
./new-push.sh
```

Il te demande un nom de branche, par exemple `feature-module-marche`, puis exécute
l'équivalent de :

```bash
git checkout -b feature-module-marche
git add .
git commit -m "Initial commit on feature-module-marche"
git push origin feature-module-marche
```

Une fois la branche poussée, ouvre une **Pull Request** sur GitHub vers `main`. Elle devra
passer la review (1 approbation minimum) et les checks CI (build + tests + Sonar) avant de
pouvoir être mergée, conformément à la règle de protection configurée sur `main`.

> ⚠️ Ce script crée une **nouvelle** branche à chaque exécution. Pour ajouter d'autres
> commits sur une branche déjà existante, utilise directement :
> ```bash
> git add .
> git commit -m "message"
> git push origin nom-de-la-branche
> ```

### `update` — synchroniser son `main` local

À lancer après qu'une Pull Request a été mergée sur GitHub, pour récupérer les derniers
changements avant de démarrer une nouvelle branche.

```powershell
.\update.bat
```
```bash
./update.sh
```

Équivalent de :

```bash
git switch main
git pull origin main
```

### Flux de travail recommandé

1. `.\update.bat` → s'assurer que `main` est à jour.
2. `.\new-push.bat` → créer une branche pour la fonctionnalité à développer.
3. Développer, commiter au fil de l'eau (`git add` / `git commit` / `git push`).
4. Ouvrir une Pull Request vers `main` sur GitHub.
5. Attendre la review + les checks CI/CD verts, puis merger.
6. `.\update.bat` → resynchroniser `main` avant la prochaine fonctionnalité.

## Pipeline CI/CD

Le fichier `.github/workflows/ci.yml` définit 4 jobs, déclenchés sur chaque `push` et
`pull_request` vers `main` ou `develop` :

| Job | Rôle |
|---|---|
| `backend` | Build, tests, couverture et analyse SonarCloud du backend |
| `frontend` | Lint ESLint, tests Vitest avec couverture, build Vite, analyse SonarCloud |
| `docker` | Build et push des images backend/frontend vers GHCR (uniquement sur push vers `main`, après succès des jobs précédents) |
| `deploy` | Déploiement SSH + `docker compose` vers l'environnement de production (déclenchement manuel, protégé par un environnement GitHub avec approbation) |

> ⚠️ **En cours de migration** : le job `backend` du pipeline (`ci.yml`) exécute encore la
> chaîne Maven/JUnit/JaCoCo héritée de l'ancien backend Java. Il doit être mis à jour pour
> builder/tester/linter le nouveau backend NestJS (Node.js/npm, Vitest, oxlint) sur le même
> modèle que le job `frontend`.

## Gouvernance & sécurité

- **Branch protection** sur `main` : Pull Request obligatoire (1 approbation minimum),
  résolution des conversations requise, status checks CI obligatoires, force-push et
  suppression de branche bloqués.
- Les administrateurs du dépôt peuvent contourner la review (utile en solo ou en cas
  d'urgence), mais le flux normal passe par une Pull Request.
- Les secrets sensibles (URL/clés Supabase, `SONAR_TOKEN`, clés de déploiement) sont
  stockés dans **GitHub Secrets**, jamais commités dans le code.
