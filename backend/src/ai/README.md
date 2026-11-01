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
