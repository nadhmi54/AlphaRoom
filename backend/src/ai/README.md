# Module IA — salle de simulation pédagogique

Socle du module IA, évaluateur de performance, Trading Coach, analyses enseignant
(Market Analyst, Replay Analyzer) et exemple de workflow n8n.
`AiModule` est importé dans `AppModule`. Sans `AI_SESSION_SOURCE`, les routes qui
lisent une séance répondent 503 (« simulation non branchée ») ; avec
`AI_SESSION_SOURCE=demo`, tout fonctionne sur la séance fictive.

## Principe

**Les chiffres sont calculés par le code, l'IA les interprète.** Le modèle de
langage ne calcule rien, ne modifie rien et ne voit que le contexte filtré par
rôle. Chaque métrique porte ses preuves (exécutions, minutes, événements) pour
qu'une affirmation d'un rapport soit toujours vérifiable.

```
Simulation ──► SessionDataProvider ──► metrics ──► contexte par rôle ──► LlmProvider
 (lecture seule)   (contrat)          (déterministe)  (alias, résumé)     (stub / Anthropic)
```

## Contenu

| Dossier | Rôle |
|---|---|
| `contract/` | Types de données de séance (`SessionData`), interface `SessionDataProvider` (à implémenter par la simulation), reconstruction de la courbe de valeur. |
| `metrics/` | P&L, rendement, exposition max, drawdown max, taux de réussite, ratio gain/perte, usage des stop-loss, slippage, délai de réaction, concentration. Tests calculés à la main. |
| `context/` | Construit ce que l'IA voit : un trader ne voit que lui, un `game_master`/`admin` voit le groupe ; alias `etu_01`… à la place des identifiants et des noms ; résumé et troncature ; empreinte SHA-256 du contexte. |
| `llm/` | Interface `LlmProvider`, `StubLlmProvider` (par défaut, aucun appel externe), `AnthropicLlmProvider` (HTTP simple), `createLlmProvider`. |
| `prompts/` | Consignes du coach (version `v1`), neutralisation des textes non fiables, construction de la requête. |
| `rubric/` | Barème visible v1 (5 critères notés /4, pondérés) appliqué **par le code** ; la note enseignant remplace la note calculée. |
| `report/` | Types du bilan, validateur de sortie (schéma, preuves existantes, chiffres du texte = chiffres réels, conseils interdits), texte de secours généré par le code, édition par l'enseignant. |
| `evaluator/` | Prompt v1 + `evaluateParticipant` : appelle le LLM, valide, relance une fois avec la liste d'erreurs, sinon texte de secours (`source: 'rules'`). |
| `storage/` | Entités `ai_reports`, `ai_report_revisions`, `ai_usage` et `AiReportsService` (génération, liste, édition, validation/publication, consommation). |
| `dto/` | Validation des entrées HTTP. |
| `coach/` | Trading Coach : réponses de l'étudiant avec SES données, limite de questions, contrôle de la réponse du modèle (chiffres réels, aucun conseil), texte du code en secours. |
| `analysis/` | Market Analyst (prix, chocs, réaction du groupe) et Replay Analyzer (comparaison de deux passages) : chiffres calculés par le code, commentaire du modèle facultatif et contrôlé. |
| `sessions/` | Séances visibles par rôle (`GET /ai/sessions`), chargement et erreurs HTTP claires. |
| `demo/` | Séance fictive à deux passages ; `AI_DEMO_STUDENT_ID` rattache un vrai compte à l'étudiant « Amine ». |
| `n8n/` | Exemple de workflow n8n (génération asynchrone des brouillons). |
| `fixtures/` | Scénario fictif « Le mardi de la panique » (30 min, XAU/USD, 4 profils d'étudiants). |

## Configuration (`backend/.env`)

```
AI_PROVIDER=stub          # stub (défaut), anthropic ou openai-compat (Groq, Gemini, OpenRouter, Ollama…)
ANTHROPIC_API_KEY=        # uniquement si AI_PROVIDER=anthropic — jamais dans git
AI_API_KEY=              # clé pour openai-compat (jamais dans git ; inutile pour un Ollama local)
AI_BASE_URL=             # adresse de l'API openai-compat, ex. https://api.groq.com/openai/v1
AI_MODEL=                 # identifiant du modèle, exigé hors stub
AI_SESSION_SOURCE=        # demo = séance fictive « mardi de la panique » ; vide = simulation non branchée (503)
AI_DEMO_STUDENT_ID=       # (démo) uuid d'un compte trader qui prend la place d'« Amine » : tester l'écran étudiant et le coach
```

Sans configuration, tout fonctionne avec le stub : rien ne part vers l'extérieur.

## Brancher la simulation

La simulation implémente `SessionDataProvider.getSession(sessionId, run)` et
renvoie un `SessionData`. Le temps est en **minutes de simulation**. Si elle ne
fournit pas de snapshots, `buildEquityCurve` reconstruit la valeur du
portefeuille à partir des exécutions et des prix. Les stop-loss et take-profit
viennent des protections de positions du module M2 (`ProtectionData`).

## API (`AiModule`, préfixe `ai/reports`)

| Route | Rôle | Qui |
|---|---|---|
| `POST /ai/reports/generate` | Génère les brouillons d'une séance (`sessionId`, `run`, `participantId?`). Les bilans déjà validés ne sont jamais écrasés (`skippedValidated`). | game_master, admin |
| `GET /ai/reports?sessionId&run` | Liste. L'étudiant ne voit que son propre bilan, **validé et publié**. | tous |
| `GET /ai/reports/usage` | Consommation (appels, tokens, durée). | game_master, admin |
| `GET /ai/reports/:id` | Détail. La trace et l'identifiant du participant restent réservés à l'enseignant. | tous |
| `PATCH /ai/reports/:id` | L'enseignant corrige textes/notes ; le bilan repasse en brouillon et est dépublié ; historique dans `ai_report_revisions`. | game_master, admin |
| `POST /ai/reports/:id/validate` | Valide (et publie si `publish: true`). | game_master, admin |

| `GET /ai/sessions` | Séances proposées dans l'interface (enseignant : toutes ; étudiant : les siennes). | tous |
| `POST /ai/coach/ask` | Question au coach (`question`, `history?`, `sessionId?`, `run?`, `alias?` réservé à l'enseignant pour tester). 6 questions/minute et 60/heure par personne. | tous |
| `POST /ai/analysis/market` | Lecture du marché d'un passage. | game_master, admin |
| `POST /ai/analysis/replay` | Comparaison de deux passages (`fromRun` < `toRun`). | game_master, admin |

Migration à appliquer : `supabase/migrations/20261101100000_ai_reports.sql`.

## Limites connues

- Le barème v1 utilise des seuils pédagogiques par défaut ; l'enseignant peut les remplacer (note libre).
- Les écritures rapport / historique / consommation ne sont pas dans une seule transaction de base.
- Les bilans sont rédigés sur le passage demandé (`run`) ; après un rollback, la simulation doit conserver les deux passages.

- Positions longues uniquement : une vente supérieure à la quantité détenue est
  signalée (`anomalous_sells`), la vente à découvert n'est pas gérée.
- Le slippage exige `expectedPrice` sur les exécutions ; sinon il vaut `null` et
  `missingData` contient `no_expected_price`.
- Le streaming des réponses et le fournisseur Anthropic réel ne sont pas testés
  en conditions réelles (pas de clé) : l'appel HTTP est testé avec un faux `fetch`.
- Le coach et les analyses s'appuient sur la séance de simulation (contrat `SessionDataProvider`), pas sur le portefeuille M1 en direct : tant que la simulation n'est pas branchée, seule la démo les alimente.
- Limite de questions du coach en mémoire : une seule instance du backend (sinon, compteur partagé à prévoir).
- Le workflow n8n est un exemple non testé dans une instance n8n ; il exige un jeton d'enseignant (le backend n'a pas encore d'authentification machine-à-machine : les jetons Supabase expirent).
- Le fournisseur Anthropic n'a pas été testé avec une vraie clé : le coach et les commentaires utilisent alors le texte du code en secours si le modèle est refusé ou indisponible.

## Branchement sur la Game Room (`AI_SESSION_SOURCE=game-room`)

- **Séance = salle** : l'identifiant de séance est l'identifiant de la salle. `GameRoomSessionProvider`
  (`game-room/`) lit les tables de la salle et produit un `SessionData` ; `session-builder.ts` est une
  fonction pure (équité recalculée à partir des exécutions et des prix, news du scénario ajoutées).
- **Passages et rollback** : le rollback supprime les exécutions et ordres postérieurs à la minute cible.
  Juste avant, `GameRoomController` appelle `RunSnapshotService.archiveCurrentRun`, qui écrit une photo
  dans `game_run_archives` (migration `20261102100000_game_run_archives.sql`). Passages archivés = 1…n-1,
  état courant = n. Le Replay Analyzer compare ces passages.
- **Routes de la Game Room** : `/game-room/:roomId/ai/analyst|coach|eval` passent par `AiGameRoomService`
  (même chiffres, mêmes contrôles que les bilans). `GameRoomAiService` ne fait que déléguer.
- **Limites** : pas de commission ni de marge dans l'équité ; une protection (stop-loss / take-profit) est
  datée à l'exécution de l'ordre qui la portait (pas aux modifications ultérieures sur la position).

## Agent coach et guide du trader (`agent/`)

Le coach n'est plus un simple chat : c'est un **agent** avec qui l'étudiant discute librement pendant la séance (sujets libres, avis de trading argumentés), et qui le guide.

- **Conversation libre** (`coach-agent.ts`, `AGENT_SYSTEM_PROMPT`) : ton de mentor, tutoiement, longueur adaptée, mise en forme Markdown (listes, tableaux). Il peut donner son avis sur une idée de trade, en scénarios, sans promettre de gain ni présenter une prédiction comme un fait. Historique renvoyé par le client (40 messages max, le widget en envoie 30) ; la discussion est conservée dans le navigateur (`localStorage`, par utilisateur et par séance).
- **Outils en lecture seule** (`agent-tools.ts`) : `get_portfolio`, `get_trades`, `get_market`, `get_events`, `get_risk_review`, `get_session_info`, `get_memory`. Le modèle décide lesquels appeler (boucle de 6 tours maximum). Garanties : aucun outil n'écrit ni ne passe d'ordre ; l'identifiant du participant est fixé par le serveur (le modèle ne peut pas lire les autres) ; aucune donnée postérieure à la minute actuelle ; les taux sont déjà en pourcentages (`*_pct`).
- **Simulations « et si ? »** : `simulate_price_move` (variation ou prix cible → gain/perte, nouvelle exposition, stop-loss déclenché ?), `simulate_stop_loss` (coût d'un stop à un niveau donné), `position_size` (quantité pour risquer X % du portefeuille avec un stop donné). Calculs faits par le code, jamais par le modèle ; rien n'est exécuté.
- **Réponse en direct** : `POST /ai/coach/stream` (SSE : `tool`, `delta`, `reset`, `done`, `error`). `POST /ai/coach` reste disponible (réponse complète). Limite : 20 questions/min et 300/h par utilisateur.
- **Contrôle souple des chiffres** : les chiffres cités sont comparés aux résultats des outils, mais un texte déjà écrit en direct n'est jamais effacé ni réécrit : les chiffres sans source sont signalés en note (« estimés ou proposés par le coach »). Les niveaux de prix proches du marché (stops, objectifs proposés), les pourcentages « ronds » génériques (5 %, 10 %…) et les petits entiers ne sont pas signalés. Une réponse vide déclenche une seule relance sans outils. Sans fournisseur « outils » (stub, Anthropic pour l'instant), le coach garde l'ancien comportement. Avec `gpt-oss`, `reasoning_effort: medium` et 4000 tokens de sortie laissent de la place à la réponse.
- **Guide proactif** (`guide-rules.ts`, `GET /ai/guide/alerts`) : règles déterministes (position sans stop-loss, exposition élevée, news sans réaction, mouvement brusque, baisse du portefeuille, stop-loss déclenché, fin de séance). Aucun appel au modèle : gratuit, instantané, testé. Le widget sonde le serveur toutes les 8 s ; chaque alerte n'est montrée qu'une fois.
- **Mémoire de séance** (`agent-memory.ts`) : alertes déjà montrées et questions posées, en mémoire du serveur (perdue au redémarrage, sans nom ni identifiant dans ce qui est envoyé au modèle).
- **Briefing** (`GET /ai/guide/briefing`) : objectifs pédagogiques, sans révéler les événements à venir. **Bilan** (`POST /ai/guide/debrief`) : texte du modèle contrôlé, ou texte du code avec points forts / points à retravailler.
- **Suivi enseignant** (`GET /ai/guide/live`, réservé aux enseignants) : qui est en difficulté, qui n'a pas de stop-loss, qui n'a pas réagi à la news.

Limites : fournisseur testé avec un faux serveur compatible OpenAI (appels d'outils inclus) ; à valider avec Groq (`openai/gpt-oss-120b`). Si le fournisseur refuse les outils, le coach retombe sur le chemin classique sans erreur.

## Analyse des marchés réels (`market/`)

Le coach répond à « quel marché est le plus rentable ? » et « quand acheter / vendre ? » avec des **calculs du code** sur des **bougies journalières réelles** ; le modèle ne fait que commenter.

- **Données** (`history.ts`) : crypto via Binance (`/api/v3/klines`), actions / matières premières / devises via Yahoo Finance (Chart API), sans clé. L'or et l'euro utilisent le vrai cours Yahoo (`GC=F`, `EURUSD=X`), avec le substitut Binance (PAXG, EURUSDT) en secours, signalé. Cache 30 min, lots de 4 requêtes, jamais d'exception : un actif indisponible est listé dans `actifs_indisponibles`. Adresses surchargeables (`MARKET_HISTORY_BINANCE_URL`, `MARKET_HISTORY_YAHOO_URL`) pour les tests sans réseau.
- **Indicateurs** (`indicators.ts`, fonctions pures) : rendement, volatilité annualisée, rendement ajusté au risque (Sharpe sans taux sans risque), baisse maximale, moyennes mobiles 20/50, RSI de Wilder, ATR, supports / résistances sur 20 jours.
- **Outils de l'agent** (`market-analysis.service.ts`) : `scan_markets` (classement des actifs et comparaison des 4 marchés sur une semaine / un mois / un trimestre, critère rendement ou rendement ajusté au risque) et `analyze_asset` (tendance, biais haussier / baissier / neutre avec ses raisons, avertissement RSI, stop et objectif calculés avec l'ATR, zone de repli possible).
- **Honnêteté** : chaque réponse porte un avertissement (performance passée, pas une prévision ; marchés réels indépendants de la séance simulée). Le biais est un score de règles simples de −3 à +3, pas une probabilité de gain ; le RSI ne change pas le biais mais avertit sur le moment d'entrer.
- **Limites** : l'API Yahoo n'est pas officielle (limites de débit possibles) ; un marché fermé a une dernière bougie ancienne (`date_derniere_bougie`). Pas encore de backtest du signal ni de Monte Carlo (étapes suivantes).


## Discussions du coach et mémoire (`coach/ai-conversations.*`)

Le coach garde plusieurs discussions par personne, côté serveur (tables `ai_conversations` et `ai_conversation_messages`, migration `supabase/migrations/20261108120000_ai_conversations.sql`, à appliquer dans Supabase).

- **Historique** : chaque question/réponse est enregistrée (avec les outils consultés, les preuves et les chiffres non vérifiés). `GET /ai/conversations` liste les discussions de la personne, `GET /ai/conversations/:id` les messages, `PATCH` renomme, `DELETE` supprime (les messages partent avec). Une discussion d'un autre est **introuvable (404)**.
- **Création** : `POST /ai/coach/ask` et `/ai/coach/stream` acceptent `conversationId`. Sans lui, une discussion est créée à la première question (titre = début de la question) et son identifiant est annoncé (événement `conversation`, puis `reply.conversationId`).
- **Mémoire** : avec `conversationId`, le serveur relit lui-même l'historique (celui envoyé par l'écran est ignoré, pour qu'on ne puisse pas falsifier les « souvenirs »). Quand plus de 36 messages ne sont pas encore résumés, les plus anciens (tous sauf les 16 derniers) sont résumés par le modèle, en arrière-plan, et fusionnés au résumé existant. Le coach reçoit : résumé + messages récents. Le résumé est donné comme **donnée isolée** (`<donnee_externe>`), jamais comme consigne.
- **Limites** : 200 discussions par personne (la moins récente est supprimée au-delà), 600 messages par discussion. Une panne du résumé n'empêche jamais de répondre. Sans modèle configuré (stub), l'historique est quand même gardé mais rien n'est résumé.

## Monte Carlo, backtest et évaluation (`market/montecarlo.ts`, `market/backtest.ts`, `eval/`)

Trois ajouts pour rendre le coach plus fiable ET démontrable. Tout est calculé par le code ; le modèle ne fait que commenter les résultats, et chaque pourcentage porte le suffixe `_pct` pour que le contrôle des chiffres le reconnaisse.

- **`simulate_outcomes`** (Monte Carlo) : 5 000 trajectoires d'un mouvement brownien géométrique, volatilité réelle des 60 derniers jours, **dérive nulle** (aucune direction supposée). Renvoie la probabilité de perte, de perdre/gagner au moins 2/5/10 %, les scénarios pessimiste (5 % des pires cas), médian et optimiste, et — si `stop_pct` est donné — la probabilité que le stop-loss soit touché avant la fin. Si le trader détient l'actif, la perte est chiffrée en montant : la position vient **du serveur**, jamais des arguments du modèle. Générateur « graîné » : même question, mêmes chiffres.
- **`backtest_signal`** : rejoue la règle de `analyze_asset` (tendance + élan + cassure) sur chaque jour de l'historique avec les seules données connues ce jour-là, puis mesure ce qui s'est passé N jours après (taux de réussite, rendement moyen, pire cas, avantage sur la moyenne). Aucun paramètre n'est optimisé (donc pas de sur-ajustement). La sortie rappelle que l'historique est court et que les observations successives se chevauchent.
- **Banc d'évaluation** : `npm run ai:eval` (dans `backend/`, avec un vrai modèle configuré dans `.env`) pose ~50 questions réparties en 9 catégories au coach (mêmes outils et même prompt qu'en production, décor fixe et déterministe), note chaque réponse automatiquement (bon outil, chiffres tous vérifiés, éléments attendus/interdits) et écrit `ai-eval-report.md` (score global, fidélité des chiffres, choix d'outils, résistance aux injections, échecs détaillés). Options : `-- --only securite` (une catégorie ou un identifiant), `-- --limit 10`, `-- --delay 3000` (pause en ms entre questions), `-- --tpm 8000` (plafond de jetons par minute ; par défaut `AI_TPM`, ou 8 000 si `AI_BASE_URL` pointe vers Groq : le banc attend tout seul quand la fenêtre de 60 s est pleine et réessaie une erreur 429 après le délai indiqué par le fournisseur). Un échec peut être une reformulation correcte : relire la section « Échecs à examiner ».
