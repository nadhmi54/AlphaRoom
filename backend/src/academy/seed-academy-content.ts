import { DataSource } from 'typeorm';

/**
 * Seed manuel du module Academy (Formation, Pédagogie & Engagement).
 *
 * Ce fichier n'est JAMAIS importé par l'application, ni par le module, ni par un
 * cron : il ne s'exécute que lorsqu'on le lance à la main pour préparer un
 * environnement de démonstration ou de test. Il insère un contenu minimal
 * (quelques cours, leurs leçons, un quiz, une mission par niveau, des badges et
 * des règles d'exemple) et reste idempotent : chaque insertion utilise
 * `on conflict do nothing`, donc relancer le script ne crée aucun doublon.
 *
 * Aucun résultat de partie ni progression de joueur n'est écrit : le module
 * Academy calcule ces données à partir des parties terminées, jamais depuis un
 * seed. Ce script ne touche qu'au CONTENU (tables academy_courses, ...).
 *
 * Usage :
 *   node --env-file=.env -r tsx/cjs src/academy/seed-academy-content.ts
 */

// Identifiants fixes : ils rendent le seed rejouable sans doublon et permettent
// de relier entre eux cours, leçons, quiz, missions, badges et règles.
const COURSE = {
  fondamentaux: 'acad0001-0000-4000-8000-000000000001',
  risque: 'acad0001-0000-4000-8000-000000000002',
  portefeuille: 'acad0001-0000-4000-8000-000000000003',
  strategies: 'acad0001-0000-4000-8000-000000000004',
} as const;

const LESSON = {
  premiersActifs: 'acad0002-0000-4000-8000-000000000001',
  passerOrdre: 'acad0002-0000-4000-8000-000000000002',
  comprendreDrawdown: 'acad0002-0000-4000-8000-000000000003',
  poserStopLoss: 'acad0002-0000-4000-8000-000000000004',
  construirePortefeuille: 'acad0002-0000-4000-8000-000000000005',
  limiterExposition: 'acad0002-0000-4000-8000-000000000006',
  strategieBaissier: 'acad0002-0000-4000-8000-000000000007',
} as const;

const QUIZ_FONDAMENTAUX = 'acad0003-0000-4000-8000-000000000001';

const QUESTION = {
  stopLoss: 'acad0004-0000-4000-8000-000000000001',
  drawdown: 'acad0004-0000-4000-8000-000000000002',
  diversification: 'acad0004-0000-4000-8000-000000000003',
} as const;

const MISSION = {
  niveau1: 'acad0005-0000-4000-8000-000000000001',
  niveau2: 'acad0005-0000-4000-8000-000000000002',
  niveau3: 'acad0005-0000-4000-8000-000000000003',
  niveau4: 'acad0005-0000-4000-8000-000000000004',
} as const;

const BADGE = {
  debutant: 'acad0006-0000-4000-8000-000000000001',
  premiereVictoire: 'acad0006-0000-4000-8000-000000000002',
  drawdown: 'acad0006-0000-4000-8000-000000000003',
  serie: 'acad0006-0000-4000-8000-000000000004',
  risqueNiveau2: 'acad0006-0000-4000-8000-000000000005',
  niveau2: 'acad0006-0000-4000-8000-000000000006',
  niveau3: 'acad0006-0000-4000-8000-000000000007',
  niveau4: 'acad0006-0000-4000-8000-000000000008',
} as const;

/**
 * Quiz supplémentaires : chaque cours en propose au moins deux, avec des
 * questions distinctes d'un quiz à l'autre. Le quiz existant du cours
 * « Fondamentaux » est conservé ; on ajoute ici le second de chaque cours.
 */
const QUIZ = {
  fondamentaux2: 'acad0008-0000-4000-8000-000000000001',
  risque1: 'acad0008-0000-4000-8000-000000000011',
  risque2: 'acad0008-0000-4000-8000-000000000012',
  portefeuille1: 'acad0008-0000-4000-8000-000000000021',
  portefeuille2: 'acad0008-0000-4000-8000-000000000022',
  strategies1: 'acad0008-0000-4000-8000-000000000031',
  strategies2: 'acad0008-0000-4000-8000-000000000032',
} as const;

/** Questions des quiz supplémentaires (3 par quiz), en français. */
const QUESTION_EXTRA = {
  fond2a: 'acad0009-0000-4000-8000-000000000001',
  fond2b: 'acad0009-0000-4000-8000-000000000002',
  fond2c: 'acad0009-0000-4000-8000-000000000003',
  risque1a: 'acad0009-0000-4000-8000-000000000011',
  risque1b: 'acad0009-0000-4000-8000-000000000012',
  risque1c: 'acad0009-0000-4000-8000-000000000013',
  risque2a: 'acad0009-0000-4000-8000-000000000021',
  risque2b: 'acad0009-0000-4000-8000-000000000022',
  risque2c: 'acad0009-0000-4000-8000-000000000023',
  portef1a: 'acad0009-0000-4000-8000-000000000031',
  portef1b: 'acad0009-0000-4000-8000-000000000032',
  portef1c: 'acad0009-0000-4000-8000-000000000033',
  portef2a: 'acad0009-0000-4000-8000-000000000041',
  portef2b: 'acad0009-0000-4000-8000-000000000042',
  portef2c: 'acad0009-0000-4000-8000-000000000043',
  strat1a: 'acad0009-0000-4000-8000-000000000051',
  strat1b: 'acad0009-0000-4000-8000-000000000052',
  strat1c: 'acad0009-0000-4000-8000-000000000053',
  strat2a: 'acad0009-0000-4000-8000-000000000061',
  strat2b: 'acad0009-0000-4000-8000-000000000062',
  strat2c: 'acad0009-0000-4000-8000-000000000063',
} as const;

/**
 * Insère des lignes en une seule requête paramétrée. Les colonnes JSON reçoivent
 * une chaîne sérialisée suivie d'un cast `::jsonb` (un tableau JavaScript serait
 * sinon interprété comme un tableau Postgres, pas comme du JSON).
 * `on conflict do nothing` rend l'ensemble idempotent.
 */
async function insertRows(
  dataSource: DataSource,
  table: string,
  columns: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<unknown>>,
  jsonColumns: ReadonlySet<string> = new Set(),
): Promise<void> {
  if (rows.length === 0) return;

  const placeholders: string[] = [];
  const values: unknown[] = [];

  for (const row of rows) {
    const cells = row.map((value, index) => {
      const column = columns[index];
      const isJson = jsonColumns.has(column);
      values.push(isJson ? JSON.stringify(value) : value);
      const placeholder = `$${values.length}`;
      return isJson ? `${placeholder}::jsonb` : placeholder;
    });
    placeholders.push(`(${cells.join(', ')})`);
  }

  await dataSource.query(
    `insert into public.${table} (${columns.join(', ')}) values ${placeholders.join(', ')} on conflict do nothing`,
    values,
  );
}

/** Insère le contenu pédagogique minimal du module Academy. */
async function seedAcademyContent(dataSource: DataSource): Promise<void> {
  // --- Cours : formation de base (niveaux 1 à 3) puis contenu avancé (niveau 4).
  await insertRows(
    dataSource,
    'academy_courses',
    ['id', 'code', 'title', 'summary', 'level', 'is_premium', 'unlock_hint', 'position'],
    [
      [
        COURSE.fondamentaux,
        'FONDAMENTAUX',
        'Fondamentaux du trading',
        'Découvrir les ordres, les actifs et le fonctionnement d’une séance de marché.',
        1,
        false,
        null,
        0,
      ],
      [
        COURSE.risque,
        'RISQUE',
        'Gestion du risque',
        'Protéger son capital : drawdown, stop-loss et taille de position.',
        2,
        false,
        'Réussis la mission du niveau 1.',
        1,
      ],
      [
        COURSE.portefeuille,
        'PORTEFEUILLE',
        'Construction de portefeuille',
        'Diversifier les actifs et maîtriser l’exposition de chaque ligne.',
        3,
        false,
        'Réussis la mission du niveau 2.',
        2,
      ],
      [
        COURSE.strategies,
        'STRATEGIES_AVANCEES',
        'Stratégies avancées',
        'Conduire une stratégie en scénario de crise. Contenu avancé, débloqué par une victoire en salle de marché.',
        4,
        true,
        'Réussis un défi en salle de marché.',
        3,
      ],
    ],
  );

  // --- Leçons de chaque cours.
  await insertRows(
    dataSource,
    'academy_lessons',
    ['id', 'course_id', 'code', 'title', 'kind', 'content', 'video_url', 'duration_minutes', 'position'],
    [
      [
        LESSON.premiersActifs,
        COURSE.fondamentaux,
        'L1',
        'Choisir ses premiers actifs',
        'text',
        'Un actif est un instrument négociable : action, indice, devise ou matière première. On privilégie des actifs liquides et compréhensibles.',
        null,
        8,
        0,
      ],
      [
        LESSON.passerOrdre,
        COURSE.fondamentaux,
        'L2',
        'Passer un ordre',
        'video',
        'Démonstration des types d’ordres : au marché, à cours limité et stop-loss.',
        'https://www.youtube.com/watch?v=academy-ordres',
        6,
        1,
      ],
      [
        LESSON.comprendreDrawdown,
        COURSE.risque,
        'L3',
        'Comprendre le drawdown',
        'text',
        'Le drawdown mesure la baisse depuis le plus haut du portefeuille. Le maîtriser, c’est d’abord le mesurer.',
        null,
        7,
        0,
      ],
      [
        LESSON.poserStopLoss,
        COURSE.risque,
        'L4',
        'Poser un stop-loss systématique',
        'text',
        'Chaque position doit porter un niveau de sortie défini à l’avance, indépendamment de l’émotion du moment.',
        null,
        9,
        1,
      ],
      [
        LESSON.construirePortefeuille,
        COURSE.portefeuille,
        'L5',
        'Construire un portefeuille',
        'text',
        'Répartir le capital entre plusieurs actifs réduit le risque spécifique sans sacrifier le rendement attendu.',
        null,
        10,
        0,
      ],
      [
        LESSON.limiterExposition,
        COURSE.portefeuille,
        'L6',
        'Limiter l’exposition par actif',
        'text',
        'Fixer une exposition maximale par ligne évite qu’un seul actif décide du sort du portefeuille.',
        null,
        8,
        1,
      ],
      [
        LESSON.strategieBaissier,
        COURSE.strategies,
        'L7',
        'Stratégies en marché baissier',
        'text',
        'Réduire l’exposition, couvrir ou se positionner vendeur : les leviers disponibles quand le marché baisse.',
        null,
        12,
        0,
      ],
    ],
  );

  // --- Un quiz rattaché au cours de base, correctif côté serveur uniquement.
  await insertRows(
    dataSource,
    'academy_quizzes',
    ['id', 'course_id', 'lesson_id', 'code', 'title', 'pass_threshold', 'position'],
    [[QUIZ_FONDAMENTAUX, COURSE.fondamentaux, null, 'QUIZ_FONDAMENTAUX', 'Quiz — Fondamentaux du trading', 70, 0]],
  );

  await insertRows(
    dataSource,
    'academy_quiz_questions',
    ['id', 'quiz_id', 'position', 'prompt', 'options', 'correct_index', 'explanation'],
    [
      [
        QUESTION.stopLoss,
        QUIZ_FONDAMENTAUX,
        0,
        'Quel ordre borne le risque de perte d’une position ?',
        ['Ordre au marché', 'Stop-loss', 'Ordre à cours limité'],
        1,
        'Le stop-loss déclenche automatiquement la sortie lorsque le prix atteint un niveau de perte prédéfini.',
      ],
      [
        QUESTION.drawdown,
        QUIZ_FONDAMENTAUX,
        1,
        'Que mesure le drawdown maximal ?',
        ['Le gain maximal', 'La baisse maximale depuis un sommet', 'Le nombre d’ordres passés'],
        1,
        'Le drawdown maximal est la plus forte baisse enregistrée depuis un sommet du portefeuille.',
      ],
      [
        QUESTION.diversification,
        QUIZ_FONDAMENTAUX,
        2,
        'Pourquoi diversifier un portefeuille ?',
        ['Pour réduire le risque spécifique', 'Pour payer plus de frais', 'Pour trader plus vite'],
        0,
        'La diversification répartit le risque : la contre-performance d’un actif pèse moins sur l’ensemble.',
      ],
    ],
    new Set(['options']),
  );

  // --- Quiz supplémentaires : chaque cours en compte au moins deux, avec des
  // questions différentes d'un quiz à l'autre. Le tirage est fait par le serveur.
  await insertRows(
    dataSource,
    'academy_quizzes',
    ['id', 'course_id', 'lesson_id', 'code', 'title', 'pass_threshold', 'position'],
    [
      [QUIZ.fondamentaux2, COURSE.fondamentaux, null, 'QUIZ_FONDAMENTAUX_2', 'Quiz — Ordres et liquidité', 70, 1],
      [QUIZ.risque1, COURSE.risque, null, 'QUIZ_RISQUE_1', 'Quiz — Mesurer le risque', 70, 0],
      [QUIZ.risque2, COURSE.risque, null, 'QUIZ_RISQUE_2', 'Quiz — Indicateurs ajustés du risque', 70, 1],
      [QUIZ.portefeuille1, COURSE.portefeuille, null, 'QUIZ_PORTEFEUILLE_1', 'Quiz — Diversification', 70, 0],
      [QUIZ.portefeuille2, COURSE.portefeuille, null, 'QUIZ_PORTEFEUILLE_2', 'Quiz — Exposition et rebalancement', 70, 1],
      [QUIZ.strategies1, COURSE.strategies, null, 'QUIZ_STRATEGIES_1', 'Quiz — Marché baissier', 70, 0],
      [QUIZ.strategies2, COURSE.strategies, null, 'QUIZ_STRATEGIES_2', 'Quiz — Volatilité et scénarios', 70, 1],
    ],
  );

  await insertRows(
    dataSource,
    'academy_quiz_questions',
    ['id', 'quiz_id', 'position', 'prompt', 'options', 'correct_index', 'explanation'],
    [
      [
        QUESTION_EXTRA.fond2a,
        QUIZ.fondamentaux2,
        0,
        'Quel type d’ordre garantit un prix d’exécution mais pas l’exécution elle-même ?',
        ['Ordre au marché', 'Ordre à cours limité', 'Ordre au prix de clôture'],
        1,
        'L’ordre à cours limité n’est exécuté que si le marché atteint le prix demandé.',
      ],
      [
        QUESTION_EXTRA.fond2b,
        QUIZ.fondamentaux2,
        1,
        'Que désigne la liquidité d’un actif ?',
        [
          'Sa capacité à être échangé rapidement sans déplacer le prix',
          'Son rendement annuel garanti',
          'Sa volatilité historique',
        ],
        0,
        'Un actif liquide s’achète et se vend vite, avec un impact limité sur son prix.',
      ],
      [
        QUESTION_EXTRA.fond2c,
        QUIZ.fondamentaux2,
        2,
        'Quel actif est généralement le plus liquide en séance ?',
        ['Une petite capitalisation peu échangée', 'Un indice large très échangé', 'Une obligation illiquide'],
        1,
        'Les indices larges concentrent les volumes et offrent la meilleure liquidité.',
      ],
      [
        QUESTION_EXTRA.risque1a,
        QUIZ.risque1,
        0,
        'Le drawdown maximal mesure…',
        ['la baisse la plus forte depuis un sommet', 'le gain maximal de la séance', 'le nombre de trades'],
        0,
        'Il quantifie la pire baisse enregistrée depuis un plus haut du portefeuille.',
      ],
      [
        QUESTION_EXTRA.risque1b,
        QUIZ.risque1,
        1,
        'À quoi sert un stop-loss ?',
        ['À borner la perte d’une position', 'À garantir un profit', 'À augmenter le levier'],
        0,
        'Le stop-loss ferme la position à un niveau de perte défini à l’avance.',
      ],
      [
        QUESTION_EXTRA.risque1c,
        QUIZ.risque1,
        2,
        'De quoi doit dépendre la taille d’une position ?',
        ['Du risque accepté par opération', 'De l’humeur du moment', 'Du nombre de messages du chat'],
        0,
        'On dimensionne la position en fonction du risque que l’on accepte de perdre.',
      ],
      [
        QUESTION_EXTRA.risque2a,
        QUIZ.risque2,
        0,
        'Un ratio de Sharpe élevé indique…',
        ['un rendement mieux ajusté du risque', 'un drawdown garanti nul', 'des frais plus élevés'],
        0,
        'Le Sharpe rapporte la performance au risque pris : plus il est haut, mieux c’est.',
      ],
      [
        QUESTION_EXTRA.risque2b,
        QUIZ.risque2,
        1,
        'La VaR à 95 % représente…',
        [
          'la perte potentielle maximale dans 95 % des cas',
          'le gain moyen attendu',
          'la volatilité annualisée',
        ],
        0,
        'La VaR borne la perte au-delà d’un seuil de confiance (ici 95 %).',
      ],
      [
        QUESTION_EXTRA.risque2c,
        QUIZ.risque2,
        2,
        'Diversifier vise d’abord à réduire…',
        ['le risque spécifique', 'le rendement attendu à zéro', 'la liquidité'],
        0,
        'La diversification atténue le risque propre à chaque actif.',
      ],
      [
        QUESTION_EXTRA.portef1a,
        QUIZ.portefeuille1,
        0,
        'Répartir le capital entre plusieurs actifs permet de…',
        ['réduire le risque spécifique', 'supprimer tout risque', 'garantir un gain'],
        0,
        'La répartition dilue le risque propre à chaque actif.',
      ],
      [
        QUESTION_EXTRA.portef1b,
        QUIZ.portefeuille1,
        1,
        'L’exposition d’une ligne correspond à…',
        ['la part du capital investie sur cet actif', 'la durée de détention', 'le nombre d’ordres passés'],
        0,
        'L’exposition est le poids de la position dans le portefeuille.',
      ],
      [
        QUESTION_EXTRA.portef1c,
        QUIZ.portefeuille1,
        2,
        'Une corrélation faible entre deux actifs…',
        ['améliore la diversification', 'augmente le risque global', 'supprime le drawdown'],
        0,
        'Des actifs peu corrélés se compensent partiellement entre eux.',
      ],
      [
        QUESTION_EXTRA.portef2a,
        QUIZ.portefeuille2,
        0,
        'Pourquoi limiter l’exposition par actif ?',
        [
          'Éviter qu’un actif décide seul du sort du portefeuille',
          'Payer moins de frais',
          'Trader plus souvent',
        ],
        0,
        'Une exposition plafonnée évite la dépendance à une seule ligne.',
      ],
      [
        QUESTION_EXTRA.portef2b,
        QUIZ.portefeuille2,
        1,
        'Le rebalancement d’un portefeuille consiste à…',
        ['revenir aux pondérations cibles', 'vendre tout en fin de séance', 'changer de courtier'],
        0,
        'On réajuste les poids pour retrouver l’allocation visée.',
      ],
      [
        QUESTION_EXTRA.portef2c,
        QUIZ.portefeuille2,
        2,
        'Le risque de concentration désigne…',
        ['une exposition trop forte sur un même actif', 'un excès de diversification', 'une erreur d’affichage'],
        0,
        'Trop concentrer le portefeuille expose à la contre-performance d’un seul actif.',
      ],
      [
        QUESTION_EXTRA.strat1a,
        QUIZ.strategies1,
        0,
        'En marché baissier, une couverture (hedge) sert à…',
        [
          'compenser une partie des pertes du portefeuille',
          'augmenter le levier sans limite',
          'supprimer les frais',
        ],
        0,
        'Une couverture prend une position inverse pour amortir la baisse.',
      ],
      [
        QUESTION_EXTRA.strat1b,
        QUIZ.strategies1,
        1,
        'Se positionner vendeur (short) expose à…',
        ['une perte potentiellement illimitée', 'une perte bornée à la mise', 'aucun risque'],
        0,
        'À la vente à découvert, la hausse du prix n’a pas de plafond : la perte non plus.',
      ],
      [
        QUESTION_EXTRA.strat1c,
        QUIZ.strategies1,
        2,
        'Réduire l’exposition en marché baissier permet de…',
        ['limiter l’ampleur du drawdown', 'garantir un gain', 'payer plus de dividendes'],
        0,
        'Moins exposé, on subit une baisse plus faible.',
      ],
      [
        QUESTION_EXTRA.strat2a,
        QUIZ.strategies2,
        0,
        'Que mesure la volatilité annualisée ?',
        ['L’ampleur des variations d’un actif sur un an', 'Le rendement garanti', 'Le nombre de séances'],
        0,
        'La volatilité annualisée quantifie l’intensité des variations sur un an.',
      ],
      [
        QUESTION_EXTRA.strat2b,
        QUIZ.strategies2,
        1,
        'Un scénario de crise sert à…',
        ['tester la robustesse de la stratégie', 'garantir des profits', 'réduire les frais'],
        0,
        'On éprouve la stratégie dans des conditions de marché extrêmes.',
      ],
      [
        QUESTION_EXTRA.strat2c,
        QUIZ.strategies2,
        2,
        'Le momentum consiste à…',
        ['suivre une tendance en cours', 'acheter systématiquement au plus bas', 'ignorer les prix'],
        0,
        'On se positionne dans le sens de la tendance établie.',
      ],
    ],
    new Set(['options']),
  );

  // --- Missions : une par niveau, critères identiques à ceux du cahier des charges.
  await insertRows(
    dataSource,
    'academy_missions',
    ['id', 'code', 'level', 'title', 'description', 'scenario_id', 'criteria', 'is_placement', 'starts_at', 'ends_at', 'is_active', 'position'],
    [
      [
        MISSION.niveau1,
        'MISSION_N1_ORDRES',
        1,
        'Prendre 3 ordres',
        'Passer au moins 3 ordres et clôturer une position pendant la séance.',
        null,
        { minOrders: 3 },
        false,
        null,
        null,
        true,
        0,
      ],
      [
        MISSION.niveau2,
        'MISSION_N2_RISQUE',
        2,
        'Maîtriser le drawdown',
        'Terminer la séance avec un drawdown maximal inférieur à 10 %.',
        null,
        { maxDrawdownLimit: 0.1 },
        false,
        null,
        null,
        true,
        1,
      ],
      [
        MISSION.niveau3,
        'MISSION_N3_PORTEFEUILLE',
        3,
        'Diversifier le portefeuille',
        'Traiter au moins 3 actifs différents pendant la séance.',
        null,
        { minAssets: 3 },
        false,
        null,
        null,
        true,
        2,
      ],
      [
        MISSION.niveau4,
        'MISSION_N4_STRATEGIE',
        4,
        'Stratégie en scénario de crise',
        'Obtenir un ratio de Sharpe d’au moins 1,5 sur le scénario de crise.',
        'crisis-2020',
        { minSharpe: 1.5 },
        false,
        null,
        null,
        true,
        3,
      ],
    ],
    new Set(['criteria']),
  );

  // --- Badges : niveau, compétence et réussite.
  await insertRows(
    dataSource,
    'academy_badges',
    ['id', 'code', 'kind', 'title', 'description', 'icon', 'position'],
    [
      [BADGE.debutant, 'DEBUTANT', 'level', 'Débutant', 'Premier palier de progression.', 'niveau', 0],
      [
        BADGE.premiereVictoire,
        'PREMIERE_VICTOIRE',
        'achievement',
        'Première victoire',
        'Obtenu au premier défi réussi en salle de marché.',
        'trophee',
        1,
      ],
      [
        BADGE.drawdown,
        'DRAWDOWN_MAITRISE',
        'achievement',
        'Drawdown maîtrisé',
        'Terminer une séance avec un drawdown maximal inférieur à 5 %.',
        'bouclier',
        2,
      ],
      [
        BADGE.serie,
        'SERIE_7_JOURS',
        'achievement',
        'Série de 7 jours',
        'S’entraîner 7 jours d’affilée.',
        'flamme',
        3,
      ],
      [
        BADGE.risqueNiveau2,
        'RISQUE_NIVEAU_2',
        'skill',
        'Risque niveau 2',
        'Maîtriser la mission de gestion du risque.',
        'risque',
        4,
      ],
      // Badges de niveau : attribués quand tous les cours du niveau sont validés.
      // Le code suit la convention du moteur (`levelBadgeCode`) : DEBUTANT pour le
      // niveau 1, puis NIVEAU_n. `icon` est une clé, traduite en emoji côté front.
      [BADGE.niveau2, 'NIVEAU_2', 'level', 'Intermédiaire', 'Tous les cours du niveau 2 validés.', 'niveau', 5],
      [BADGE.niveau3, 'NIVEAU_3', 'level', 'Avancé', 'Tous les cours du niveau 3 validés.', 'niveau', 6],
      [BADGE.niveau4, 'NIVEAU_4', 'level', 'Expert', 'Tous les cours du niveau 4 validés.', 'niveau', 7],
    ],
  );

  // --- Règles d'exemple : progression (quiz) et victoire (partie, défi, série).
  await insertRows(
    dataSource,
    'academy_unlock_rules',
    [
      'id',
      'code',
      'trigger_event',
      'mission_id',
      'conditions',
      'reward_type',
      'reward_course_id',
      'reward_badge_id',
      'xp_amount',
      'choice_options',
      'is_active',
      'priority',
    ],
    [
      [
        'acad0007-0000-4000-8000-000000000001',
        'RULE_QUIZ_FONDAMENTAUX',
        'quiz_passed',
        null,
        {},
        'xp',
        null,
        null,
        50,
        null,
        true,
        0,
      ],
      [
        'acad0007-0000-4000-8000-000000000002',
        'RULE_PREMIERE_VICTOIRE',
        'challenge_won',
        null,
        { minScore: 50 },
        'badge',
        null,
        BADGE.premiereVictoire,
        0,
        null,
        true,
        1,
      ],
      [
        'acad0007-0000-4000-8000-000000000003',
        'RULE_DRAWDOWN_MAITRISE',
        'game_finished',
        null,
        { maxDrawdownLimit: 0.05, minOrders: 3 },
        'badge',
        null,
        BADGE.drawdown,
        0,
        null,
        true,
        2,
      ],
      [
        'acad0007-0000-4000-8000-000000000004',
        'RULE_DEBLOQUE_AVANCE',
        'game_finished',
        null,
        { minScore: 60, maxDrawdownLimit: 0.2 },
        'course',
        COURSE.strategies,
        null,
        0,
        null,
        true,
        3,
      ],
      [
        'acad0007-0000-4000-8000-000000000005',
        'RULE_COMPETENCE_RISQUE',
        'game_finished',
        MISSION.niveau2,
        { maxDrawdownLimit: 0.1 },
        'badge',
        null,
        BADGE.risqueNiveau2,
        0,
        null,
        true,
        4,
      ],
      [
        'acad0007-0000-4000-8000-000000000006',
        'RULE_SERIE_7_JOURS',
        'streak_days',
        null,
        { minStreakDays: 7 },
        'badge',
        null,
        BADGE.serie,
        0,
        null,
        true,
        5,
      ],
    ],
    new Set(['conditions']),
  );
}

/** Point d'entrée manuel : ouvre la connexion, insère le contenu, referme. */
async function main(): Promise<void> {
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:54322/postgres',
    synchronize: false,
  });

  try {
    await dataSource.initialize();
    console.log('Connexion établie pour le seed Academy...');
    await seedAcademyContent(dataSource);
    console.log('Seed Academy terminé : contenu minimal inséré (sans doublon).');
  } catch (error) {
    console.error('Erreur lors du seed Academy :', error);
  } finally {
    await dataSource.destroy();
  }
}

void main();
