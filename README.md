# AlphaRoom

Simulateur de Salle de Marché — PFE ESPRIT, Équipe PIF.

## Structure du repo

```
AlphaRoom/
├── .github/workflows/ci.yml   # Pipeline CI/CD (build, tests, Sonar, Docker, deploy)
├── backend/                   # API Spring Boot (Java 21, Maven)
├── frontend/                  # Application React (Vite)
├── docker-compose.yml         # Environnement local : db + backend + frontend
├── new-push.sh                # Crée une branche, commit initial, push
└── update.sh                  # Bascule sur main et récupère les derniers changements
```

Le backend et le frontend ci-dessus sont un squelette minimal (endpoint `/api/health`,
page d'accueil React) qui sert à valider que toute la chaîne build → tests → Docker →
CI fonctionne. Chaque membre de l'équipe remplace/complète avec le code réel de son
module (marché, portefeuille, IA, stress testing, XAI, actuariat).

## Lancer en local

```bash
docker compose up --build
```

- Frontend : http://localhost:8081
- Backend : http://localhost:8080/api/health
- DB (Postgres) : localhost:5433

## Avant le premier push

1. Créer le repo GitHub (fait : `nadhmi54/AlphaRoom`).
2. Dans **Settings → Secrets and variables → Actions**, ajouter au minimum :
   - `SONAR_TOKEN` (depuis SonarCloud)
   - `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` (uniquement si le job `deploy` est utilisé)
3. Créer le projet sur [SonarCloud](https://sonarcloud.io), lié à l'organisation GitHub
   `nadhmi54`, et vérifier que `sonar.projectKey` / `sonar.organization` dans
   `backend/pom.xml` et `frontend/sonar-project.properties` correspondent.
4. Dans **Settings → Environments**, créer un environnement `production` avec une
   règle d'approbation si le job `deploy` doit être utilisé.
5. Dans **Settings → Branches**, activer la protection de `main` (et `develop`) :
   review obligatoire + statut CI vert obligatoire + quality gate Sonar obligatoire.

## Scripts

```bash
chmod +x new-push.sh update.sh
./new-push.sh   # nouvelle branche + commit + push
./update.sh     # main à jour avec origin
```
