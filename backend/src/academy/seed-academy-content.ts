import { DataSource } from 'typeorm';

/**
 * Seed manuel du module Academy (Formation, Pédagogie & Engagement).
 *
 * Ce fichier n'est JAMAIS importé par l'application, ni par le module, ni par un
 * cron : il ne s'exécute que lorsqu'on le lance à la main pour préparer un
 * environnement de démonstration ou de test. Il insère le contenu pédagogique
 * (cours, leçons vidéo, quizzes, missions, badges, règles) et reste idempotent :
 * chaque insertion utilise `on conflict do nothing`, donc relancer le script ne
 * crée aucun doublon.
 *
 * Les leçons sont toutes au format vidéo : l'élève apprend en regardant une
 * démonstration, souvent un exemple concret simulé dans la Game Room. Aucun
 * cours n'est rédigé en texte long.
 *
 * Aucun résultat de partie ni progression de joueur n'est écrit : le module
 * Academy calcule ces données à partir des parties terminées, jamais depuis un
 * seed. Ce script ne touche qu'au CONTENU (tables academy_courses, ...).
 *
 * Usage :
 *   node --env-file=.env -r tsx/cjs src/academy/seed-academy-content.ts
 */

// Identifiants fixes : ils rendent le seed rejouable sans doublon et permettent
// de relier entre eux cours, leçons, quizzes, missions, badges et règles.
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

// 6 quizzes par cours (plus de 5), avec 5 questions chacun.
const QUIZ = {
  fondamentaux1: 'acad0003-0000-4000-8000-000000000001',
  fondamentaux2: 'acad0008-0000-4000-8000-000000000001',
  fondamentaux3: 'acad0008-0000-4000-8000-000000000002',
  fondamentaux4: 'acad0008-0000-4000-8000-000000000003',
  fondamentaux5: 'acad0008-0000-4000-8000-000000000004',
  fondamentaux6: 'acad0008-0000-4000-8000-000000000005',
  risque1: 'acad0008-0000-4000-8000-000000000011',
  risque2: 'acad0008-0000-4000-8000-000000000012',
  risque3: 'acad0008-0000-4000-8000-000000000013',
  risque4: 'acad0008-0000-4000-8000-000000000014',
  risque5: 'acad0008-0000-4000-8000-000000000015',
  risque6: 'acad0008-0000-4000-8000-000000000016',
  portefeuille1: 'acad0008-0000-4000-8000-000000000021',
  portefeuille2: 'acad0008-0000-4000-8000-000000000022',
  portefeuille3: 'acad0008-0000-4000-8000-000000000023',
  portefeuille4: 'acad0008-0000-4000-8000-000000000024',
  portefeuille5: 'acad0008-0000-4000-8000-000000000025',
  portefeuille6: 'acad0008-0000-4000-8000-000000000026',
  strategies1: 'acad0008-0000-4000-8000-000000000031',
  strategies2: 'acad0008-0000-4000-8000-000000000032',
  strategies3: 'acad0008-0000-4000-8000-000000000033',
  strategies4: 'acad0008-0000-4000-8000-000000000034',
  strategies5: 'acad0008-0000-4000-8000-000000000035',
  strategies6: 'acad0008-0000-4000-8000-000000000036',
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

/** Insère le contenu pédagogique du module Academy. */
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
        'Découvrir les actifs, les ordres et le fonctionnement d’une séance de marché, en vidéo.',
        1,
        false,
        null,
        0,
      ],
      [
        COURSE.risque,
        'RISQUE',
        'Gestion du risque',
        'Protéger son capital : drawdown, stop-loss et taille de position. Toutes les leçons sont en vidéo.',
        2,
        false,
        'Réussis la mission du niveau 1.',
        1,
      ],
      [
        COURSE.portefeuille,
        'PORTEFEUILLE',
        'Construction de portefeuille',
        'Diversifier les actifs et maîtriser l’exposition de chaque ligne, avec des exemples simulés en salle de marché.',
        3,
        false,
        'Réussis la mission du niveau 2.',
        2,
      ],
      [
        COURSE.strategies,
        'STRATEGIES_AVANCEES',
        'Stratégies avancées',
        'Conduire une stratégie en scénario de crise. Contenu vidéo avancé, débloqué par une victoire en salle de marché.',
        4,
        true,
        'Réussis un défi en salle de marché.',
        3,
      ],
    ],
  );

  // --- Leçons : TOUTES au format vidéo. Le champ `content` décrit ce que
  // montre la vidéo (notamment l'exemple de simulation Game Room) et sert de
  // légende. `video_url` pointe vers la vidéo à regarder.
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
        'video',
        'La vidéo présente les principales familles d’actifs (actions, indices, devises, matières premières) et montre, dans une simulation Game Room, comment sélectionner des actifs liquides et lisibles pour commencer. On y voit un portefeuille passer d’un actif unique à une sélection diversifiée.',
        'https://www.youtube.com/embed/p7HKvqRI_Bo',
        8,
        0,
      ],
      [
        LESSON.passerOrdre,
        COURSE.fondamentaux,
        'L2',
        'Passer un ordre',
        'video',
        'Démonstration en direct des types d’ordres : ordre au marché, ordre à cours limité et stop-loss. La vidéo rejoue une séance Game Room où chaque type d’ordre est passé sur un même actif, avec comparaison des prix d’exécution et du risque pris.',
        'https://www.youtube.com/embed/E7xW4cDp2H0',
        10,
        1,
      ],
      [
        LESSON.comprendreDrawdown,
        COURSE.risque,
        'L3',
        'Comprendre le drawdown',
        'video',
        'La vidéo définit le drawdown maximal et le calcule pas à pas sur une courbe de valeur de portefeuille issue d’une partie Game Room. On y voit comment une série de pertes creuse le drawdown et comment une reprise le réduit partiellement.',
        'https://www.youtube.com/embed/2Q6R1rJ1v0E',
        9,
        0,
      ],
      [
        LESSON.poserStopLoss,
        COURSE.risque,
        'L4',
        'Poser un stop-loss systématique',
        'video',
        'Chaque position doit porter un niveau de sortie défini à l’avance. La vidéo montre, sur une simulation Game Room, l’effet d’un stop-loss bien placé : la sortie se déclenche automatiquement et le capital est préservé, contrairement à une position laissée sans protection.',
        'https://www.youtube.com/embed/0Ld9IqZ8J0Q',
        11,
        1,
      ],
      [
        LESSON.construirePortefeuille,
        COURSE.portefeuille,
        'L5',
        'Construire un portefeuille',
        'video',
        'La vidéo explique la diversification et la met en œuvre dans une partie Game Room : répartir le capital entre plusieurs actifs peu corrélés réduit le risque spécifique. On y compare un portefeuille concentré (1 actif) à un portefeuille diversifié (5 actifs) sur la même séance.',
        'https://www.youtube.com/embed/ZiQLRAEFDVw',
        12,
        0,
      ],
      [
        LESSON.limiterExposition,
        COURSE.portefeuille,
        'L6',
        'Limiter l’exposition par actif',
        'video',
        'Fixer une exposition maximale par ligne évite qu’un seul actif décide du sort du portefeuille. La vidéo montre une simulation Game Room où une position trop importante fait chuter l’ensemble, puis le même scénario avec une exposition plafonnée à 20 % par actif.',
        'https://www.youtube.com/embed/3sUSBHo5pLg',
        10,
        1,
      ],
      [
        LESSON.strategieBaissier,
        COURSE.strategies,
        'L7',
        'Stratégies en marché baissier',
        'video',
        'Quand le marché baisse, plusieurs leviers existent : réduire l’exposition, couvrir ses positions, ou se positionner vendeur. La vidéo déroule un scénario de crise Game Room et montre ces trois approches, avec leur impact sur le drawdown et le rendement final.',
        'https://www.youtube.com/embed/Tt9z0O7WJgY',
        14,
        0,
      ],
    ],
  );

  // --- 6 quizzes par cours, 5 questions chacun.
  const quizzes: ReadonlyArray<readonly [string, string, string, string, number, number]> = [
    [QUIZ.fondamentaux1, COURSE.fondamentaux, 'QUIZ_FONDAMENTAUX_1', 'Quiz — Actifs et liquidité', 70, 0],
    [QUIZ.fondamentaux2, COURSE.fondamentaux, 'QUIZ_FONDAMENTAUX_2', 'Quiz — Types d’ordres', 70, 1],
    [QUIZ.fondamentaux3, COURSE.fondamentaux, 'QUIZ_FONDAMENTAUX_3', 'Quiz — Fonctionnement du marché', 70, 2],
    [QUIZ.fondamentaux4, COURSE.fondamentaux, 'QUIZ_FONDAMENTAUX_4', 'Quiz — Salle de marché', 70, 3],
    [QUIZ.fondamentaux5, COURSE.fondamentaux, 'QUIZ_FONDAMENTAUX_5', 'Quiz — Premiers trades', 70, 4],
    [QUIZ.fondamentaux6, COURSE.fondamentaux, 'QUIZ_FONDAMENTAUX_6', 'Quiz — Synthèse fondamentaux', 70, 5],
    [QUIZ.risque1, COURSE.risque, 'QUIZ_RISQUE_1', 'Quiz — Mesurer le risque', 70, 0],
    [QUIZ.risque2, COURSE.risque, 'QUIZ_RISQUE_2', 'Quiz — Indicateurs de risque', 70, 1],
    [QUIZ.risque3, COURSE.risque, 'QUIZ_RISQUE_3', 'Quiz — Stop-loss et protection', 70, 2],
    [QUIZ.risque4, COURSE.risque, 'QUIZ_RISQUE_4', 'Quiz — Taille de position', 70, 3],
    [QUIZ.risque5, COURSE.risque, 'QUIZ_RISQUE_5', 'Quiz — Drawdown en pratique', 70, 4],
    [QUIZ.risque6, COURSE.risque, 'QUIZ_RISQUE_6', 'Quiz — Synthèse risque', 70, 5],
    [QUIZ.portefeuille1, COURSE.portefeuille, 'QUIZ_PORTEFEUILLE_1', 'Quiz — Diversification', 70, 0],
    [QUIZ.portefeuille2, COURSE.portefeuille, 'QUIZ_PORTEFEUILLE_2', 'Quiz — Exposition et corrélation', 70, 1],
    [QUIZ.portefeuille3, COURSE.portefeuille, 'QUIZ_PORTEFEUILLE_3', 'Quiz — Construction', 70, 2],
    [QUIZ.portefeuille4, COURSE.portefeuille, 'QUIZ_PORTEFEUILLE_4', 'Quiz — Rebalancement', 70, 3],
    [QUIZ.portefeuille5, COURSE.portefeuille, 'QUIZ_PORTEFEUILLE_5', 'Quiz — Concentration', 70, 4],
    [QUIZ.portefeuille6, COURSE.portefeuille, 'QUIZ_PORTEFEUILLE_6', 'Quiz — Synthèse portefeuille', 70, 5],
    [QUIZ.strategies1, COURSE.strategies, 'QUIZ_STRATEGIES_1', 'Quiz — Marché baissier', 70, 0],
    [QUIZ.strategies2, COURSE.strategies, 'QUIZ_STRATEGIES_2', 'Quiz — Volatilité et scénarios', 70, 1],
    [QUIZ.strategies3, COURSE.strategies, 'QUIZ_STRATEGIES_3', 'Quiz — Couverture', 70, 2],
    [QUIZ.strategies4, COURSE.strategies, 'QUIZ_STRATEGIES_4', 'Quiz — Vente à découvert', 70, 3],
    [QUIZ.strategies5, COURSE.strategies, 'QUIZ_STRATEGIES_5', 'Quiz — Momentum', 70, 4],
    [QUIZ.strategies6, COURSE.strategies, 'QUIZ_STRATEGIES_6', 'Quiz — Synthèse stratégies', 70, 5],
  ];

  await insertRows(
    dataSource,
    'academy_quizzes',
    ['id', 'course_id', 'lesson_id', 'code', 'title', 'pass_threshold', 'position'],
    quizzes.map(([id, courseId, code, title, threshold, position]) => [
      id,
      courseId,
      null,
      code,
      title,
      threshold,
      position,
    ]),
  );

  // --- Questions : 5 par quiz. Chaque question a 3 options.
  const questions: ReadonlyArray<
    readonly [string, string, number, string, readonly string[], number, string]
  > = [
    // === Fondamentaux 1 : Actifs et liquidité ===
    [
      'acad0009-0000-4000-8000-000000000001',
      QUIZ.fondamentaux1, 0,
      'Qu’est-ce qu’un actif négociable ?',
      ['Un instrument échangeable sur un marché', 'Un compte bancaire', 'Un type d’ordre'],
      0, 'Un actif est un instrument négociable : action, indice, devise ou matière première.',
    ],
    [
      'acad0009-0000-4000-8000-000000000002',
      QUIZ.fondamentaux1, 1,
      'La liquidité d’un actif désigne…',
      ['sa capacité à être échangé vite sans déplacer le prix', 'son rendement garanti', 'sa volatilité passée'],
      0, 'Un actif liquide s’achète et se vend rapidement, avec un faible impact sur le prix.',
    ],
    [
      'acad0009-0000-4000-8000-000000000003',
      QUIZ.fondamentaux1, 2,
      'Quel actif offre généralement la meilleure liquidité en séance ?',
      ['Une petite capitalisation peu échangée', 'Un indice large très échangé', 'Une obligation rare'],
      1, 'Les indices larges concentrent les volumes et offrent la meilleure liquidité.',
    ],
    [
      'acad0009-0000-4000-8000-000000000004',
      QUIZ.fondamentaux1, 3,
      'Que signifie « bid » et « ask » ?',
      ['Le prix acheteur et le prix vendeur', 'Le plus haut et le plus bas', 'Le volume et la variation'],
      0, 'Bid est le meilleur prix acheteur, ask le meilleur prix vendeur.',
    ],
    [
      'acad0009-0000-4000-8000-000000000005',
      QUIZ.fondamentaux1, 4,
      'Le spread correspond à…',
      ['la différence entre ask et bid', 'le rendement journalier', 'la volatilité annualisée'],
      0, 'Le spread est l’écart entre le prix vendeur (ask) et le prix acheteur (bid).',
    ],

    // === Fondamentaux 2 : Types d'ordres ===
    [
      'acad0009-0000-4000-8000-000000000006',
      QUIZ.fondamentaux2, 0,
      'Quel ordre borne le risque de perte d’une position ?',
      ['Ordre au marché', 'Stop-loss', 'Ordre à cours limité'],
      1, 'Le stop-loss déclenche la sortie quand le prix atteint un niveau de perte prédéfini.',
    ],
    [
      'acad0009-0000-4000-8000-000000000007',
      QUIZ.fondamentaux2, 1,
      'Un ordre au marché garantit…',
      ['l’exécution immédiate mais pas le prix', 'un prix fixe mais pas l’exécution', 'un rendement garanti'],
      0, 'L’ordre au marché s’exécute tout de suite, au prix disponible.',
    ],
    [
      'acad0009-0000-4000-8000-000000000008',
      QUIZ.fondamentaux2, 2,
      'Un ordre à cours limité garantit…',
      ['un prix d’exécution mais pas l’exécution', 'l’exécution immédiate', 'un gain certain'],
      0, 'Il ne s’exécute que si le marché atteint le prix demandé.',
    ],
    [
      'acad0009-0000-4000-8000-000000000009',
      QUIZ.fondamentaux2, 3,
      'Quel ordre est le plus risqué en cas de gap de prix ?',
      ['Ordre au marché', 'Ordre à cours limité', 'Stop-loss'],
      0, 'En cas de gap, l’ordre au marché s’exécute à un prix potentiellement très éloigné.',
    ],
    [
      'acad0009-0000-4000-8000-000000000010',
      QUIZ.fondamentaux2, 4,
      'Un stop-loss sert à…',
      ['sortir automatiquement à un niveau de perte défini', 'garantir un profit', 'augmenter la taille de position'],
      0, 'Il protège le capital en fermant la position au-delà d’une perte acceptée.',
    ],

    // === Fondamentaux 3 : Fonctionnement du marché ===
    [
      'acad0009-0000-4000-8000-000000000011',
      QUIZ.fondamentaux3, 0,
      'Le carnet d’ordres contient…',
      ['les ordres à cours limité en attente', 'l’historique des trades', 'les positions ouvertes'],
      0, 'Le carnet répertorie les ordres d’achat et de vente en attente d’exécution.',
    ],
    [
      'acad0009-0000-4000-8000-000000000012',
      QUIZ.fondamentaux3, 1,
      'Que se passe-t-il quand un ordre au marché arrive ?',
      ['Il s’exécute contre les meilleurs ordres du carnet', 'Il attend dans le carnet', 'Il est refusé'],
      0, 'L’ordre au marché croise immédiatement les meilleurs prix disponibles.',
    ],
    [
      'acad0009-0000-4000-8000-000000000013',
      QUIZ.fondamentaux3, 2,
      'La volatilité mesure…',
      ['l’ampleur des variations de prix', 'le rendement moyen', 'la liquidité'],
      0, 'Une volatilité élevée signifie des variations de prix importantes.',
    ],
    [
      'acad0009-0000-4000-8000-000000000014',
      QUIZ.fondamentaux3, 3,
      'Un tick correspond à…',
      ['une variation minimale de prix', 'une minute de séance', 'un ordre annulé'],
      0, 'Le tick est la plus petite variation de prix autorisée pour un actif.',
    ],
    [
      'acad0009-0000-4000-8000-000000000015',
      QUIZ.fondamentaux3, 4,
      'Le prix de référence d’un actif est généralement…',
      ['le dernier prix échangé', 'le plus haut de la séance', 'le prix d’ouverture'],
      0, 'Le dernier prix échangé sert de référence pour la valorisation.',
    ],

    // === Fondamentaux 4 : Salle de marché ===
    [
      'acad0009-0000-4000-8000-000000000016',
      QUIZ.fondamentaux4, 0,
      'Dans la Game Room, le rôle du Meneur de Jeu est de…',
      ['contrôler le temps, les scénarios et superviser les participants', 'passer des ordres pour les étudiants', 'calculer les impôts'],
      0, 'Le Meneur de Jeu anime la séance : temps, événements, chocs de marché.',
    ],
    [
      'acad0009-0000-4000-8000-000000000017',
      QUIZ.fondamentaux4, 1,
      'Que permet un choc de marché déclenché par le Meneur de Jeu ?',
      ['Simuler une hausse ou baisse brutale des prix', 'Augmenter le capital de tous', 'Réinitialiser les positions'],
      0, 'Les chocs simulent des événements de marché réels (krach, annonce, etc.).',
    ],
    [
      'acad0009-0000-4000-8000-000000000018',
      QUIZ.fondamentaux4, 2,
      'La vitesse de la simulation sert à…',
      ['accélérer ou ralentir le temps de marché', 'changer les actifs disponibles', 'modifier le capital'],
      0, 'Le Meneur de Jeu peut accélérer la séance pour simuler plus de temps.',
    ],
    [
      'acad0009-0000-4000-8000-000000000019',
      QUIZ.fondamentaux4, 3,
      'Le leaderboard de la Game Room affiche…',
      ['le classement des participants par performance', 'les ordres en attente', 'les cotations historiques'],
      0, 'Le leaderboard classe les participants selon leur rendement.',
    ],
    [
      'acad0009-0000-4000-8000-000000000020',
      QUIZ.fondamentaux4, 4,
      'Un scénario pédagogique dans la Game Room est…',
      ['une séquence de prix pré-écrite pour illustrer un cas concret', 'une question de quiz', 'un type d’ordre'],
      0, 'Le scénario rejoue une situation de marché réelle ou construite pour apprendre.',
    ],

    // === Fondamentaux 5 : Premiers trades ===
    [
      'acad0009-0000-4000-8000-000000000021',
      QUIZ.fondamentaux5, 0,
      'Quelle est la première étape avant de trader ?',
      ['Définir son risque et sa stratégie', 'Acheter le plus d’actifs possible', 'Vendre tout'],
      0, 'On ne trade jamais sans avoir défini son risque et son plan.',
    ],
    [
      'acad0009-0000-4000-8000-000000000022',
      QUIZ.fondamentaux5, 1,
      'Le PnL d’une position correspond à…',
      ['la différence entre le prix de vente et le prix d’achat', 'le nombre d’ordres passés', 'la durée de détention'],
      0, 'Le PnL (Profit and Loss) est le gain ou la perte latente ou réalisé.',
    ],
    [
      'acad0009-0000-4000-8000-000000000023',
      QUIZ.fondamentaux5, 2,
      'Fermer une position signifie…',
      ['vendre ce que l’on détient (ou racheter ce que l’on a vendu)', 'supprimer l’ordre du carnet', 'changer d’actif'],
      0, 'On clôt la position en réalisant le PnL.',
    ],
    [
      'acad0009-0000-4000-8000-000000000024',
      QUIZ.fondamentaux5, 3,
      'Une position longue correspond à…',
      ['un achat d’actif', 'une vente à découvert', 'un stop-loss'],
      0, 'Être long, c’est avoir acheté et donc bénéficier d’une hausse.',
    ],
    [
      'acad0009-0000-4000-8000-000000000025',
      QUIZ.fondamentaux5, 4,
      'Le capital disponible pour trader est appelé…',
      ['cash disponible', 'PnL', 'drawdown'],
      0, 'Le cash est la somme disponible pour passer de nouveaux ordres.',
    ],

    // === Fondamentaux 6 : Synthèse ===
    [
      'acad0009-0000-4000-8000-000000000026',
      QUIZ.fondamentaux6, 0,
      'Lequel de ces ordres protège contre une perte trop importante ?',
      ['Stop-loss', 'Ordre au marché', 'Ordre à cours limité d’achat'],
      0, 'Le stop-loss ferme automatiquement la position au-delà d’un seuil de perte.',
    ],
    [
      'acad0009-0000-4000-8000-000000000027',
      QUIZ.fondamentaux6, 1,
      'Un actif liquide se caractérise par…',
      ['des volumes d’échange élevés', 'une volatilité nulle', 'un spread très large'],
      0, 'La liquidité vient des volumes et se traduit par un spread serré.',
    ],
    [
      'acad0009-0000-4000-8000-000000000028',
      QUIZ.fondamentaux6, 2,
      'Que mesure la volatilité ?',
      ['L’ampleur des variations de prix', 'Le rendement moyen', 'La liquidité'],
      0, 'La volatilité quantifie l’intensité des mouvements de prix.',
    ],
    [
      'acad0009-0000-4000-8000-000000000029',
      QUIZ.fondamentaux6, 3,
      'Dans la Game Room, le Meneur de Jeu peut…',
      ['déclencher des chocs de marché', 'modifier le capital de départ des participants', 'choisir les réponses des quizzes'],
      0, 'Les chocs de marché sont un outil pédagogique du Meneur de Jeu.',
    ],
    [
      'acad0009-0000-4000-8000-000000000030',
      QUIZ.fondamentaux6, 4,
      'Le PnL réalisé apparaît quand…',
      ['la position est fermée', 'le prix bouge', 'on passe un ordre'],
      0, 'Le PnL n’est réalisé qu’à la clôture de la position.',
    ],

    // === Risque 1 : Mesurer le risque ===
    [
      'acad0009-0000-4000-8000-000000000031',
      QUIZ.risque1, 0,
      'Le drawdown maximal mesure…',
      ['la baisse la plus forte depuis un sommet', 'le gain maximal de la séance', 'le nombre de trades'],
      0, 'Il quantifie la pire baisse enregistrée depuis un plus haut du portefeuille.',
    ],
    [
      'acad0009-0000-4000-8000-000000000032',
      QUIZ.risque1, 1,
      'À quoi sert un stop-loss ?',
      ['À borner la perte d’une position', 'À garantir un profit', 'À augmenter le levier'],
      0, 'Le stop-loss ferme la position à un niveau de perte défini à l’avance.',
    ],
    [
      'acad0009-0000-4000-8000-000000000033',
      QUIZ.risque1, 2,
      'De quoi doit dépendre la taille d’une position ?',
      ['Du risque accepté par opération', 'De l’humeur du moment', 'Du nombre de messages du chat'],
      0, 'On dimensionne la position en fonction du risque que l’on accepte de perdre.',
    ],
    [
      'acad0009-0000-4000-8000-000000000034',
      QUIZ.risque1, 3,
      'Le risque de marché correspond à…',
      ['les pertes dues aux mouvements de prix', 'les fraudes', 'les pannes techniques'],
      0, 'Le risque de marché est l’exposition aux variations de prix.',
    ],
    [
      'acad0009-0000-4000-8000-000000000035',
      QUIZ.risque1, 4,
      'Quel indicateur permet de comparer le risque de deux actifs ?',
      ['La volatilité', 'Le prix', 'Le nombre d’ordres'],
      0, 'La volatilité est une mesure standard du risque d’un actif.',
    ],

    // === Risque 2 : Indicateurs de risque ===
    [
      'acad0009-0000-4000-8000-000000000036',
      QUIZ.risque2, 0,
      'Un ratio de Sharpe élevé indique…',
      ['un rendement mieux ajusté du risque', 'un drawdown garanti nul', 'des frais plus élevés'],
      0, 'Le Sharpe rapporte la performance au risque pris : plus il est haut, mieux c’est.',
    ],
    [
      'acad0009-0000-4000-8000-000000000037',
      QUIZ.risque2, 1,
      'La VaR à 95 % représente…',
      ['la perte potentielle maximale dans 95 % des cas', 'le gain moyen attendu', 'la volatilité annualisée'],
      0, 'La VaR borne la perte au-delà d’un seuil de confiance (ici 95 %).',
    ],
    [
      'acad0009-0000-4000-8000-000000000038',
      QUIZ.risque2, 2,
      'Diversifier vise d’abord à réduire…',
      ['le risque spécifique', 'le rendement attendu à zéro', 'la liquidité'],
      0, 'La diversification atténue le risque propre à chaque actif.',
    ],
    [
      'acad0009-0000-4000-8000-000000000039',
      QUIZ.risque2, 3,
      'Le ratio de Sharpe se calcule avec…',
      ['la moyenne et l’écart-type des rendements', 'le seul drawdown', 'le nombre d’ordres'],
      0, 'Sharpe = (rendement moyen − taux sans risque) / écart-type.',
    ],
    [
      'acad0009-0000-4000-8000-000000000040',
      QUIZ.risque2, 4,
      'Une volatilité annualisée élevée signifie…',
      ['des variations de prix importantes sur l’année', 'un rendement garanti élevé', 'une liquidité faible'],
      0, 'La volatilité annualisée mesure l’intensité des variations sur un an.',
    ],

    // === Risque 3 : Stop-loss et protection ===
    [
      'acad0009-0000-4000-8000-000000000041',
      QUIZ.risque3, 0,
      'Où placer un stop-loss idéalement ?',
      ['À un niveau où le scénario d’achat est invalidé', 'Au prix d’achat exact', 'Très loin du prix d’entrée'],
      0, 'Le stop-loss doit correspondre au niveau où l’analyse initiale n’est plus valide.',
    ],
    [
      'acad0009-0000-4000-8000-000000000042',
      QUIZ.risque3, 1,
      'Un stop-loss trop serré risque de…',
      ['être déclenché par du bruit de marché', 'ne jamais se déclencher', 'garantir un profit'],
      0, 'Un stop trop proche du prix d’entrée se déclenche sur des variations normales.',
    ],
    [
      'acad0009-0000-4000-8000-000000000043',
      QUIZ.risque3, 2,
      'Le risk-reward ratio compare…',
      ['le gain potentiel à la perte potentielle', 'deux actifs', 'la volatilité à la liquidité'],
      0, 'On compare le gain visé à la perte acceptée si le stop est touché.',
    ],
    [
      'acad0009-0000-4000-8000-000000000044',
      QUIZ.risque3, 3,
      'Un risk-reward de 1:3 signifie…',
      ['pour 1 € de risque, on vise 3 € de gain', 'pour 3 € de risque, 1 € de gain', 'un gain de 3 %'],
      0, 'Le gain visé est 3 fois plus important que la perte acceptée.',
    ],
    [
      'acad0009-0000-4000-8000-000000000045',
      QUIZ.risque3, 4,
      'Pourquoi éviter de déplacer son stop-loss contre sa position ?',
      ['Cela augmente le risque initialement accepté', 'Cela garantit le gain', 'Cela réduit la taille de position'],
      0, 'Élargir son stop augmente la perte potentielle au-delà du plan initial.',
    ],

    // === Risque 4 : Taille de position ===
    [
      'acad0009-0000-4000-8000-000000000046',
      QUIZ.risque4, 0,
      'Le risque par position doit représenter idéalement…',
      ['1 à 2 % du capital', '10 % du capital', '50 % du capital'],
      0, 'On limite le risque par position à 1–2 % pour survivre aux séries de pertes.',
    ],
    [
      'acad0009-0000-4000-8000-000000000047',
      QUIZ.risque4, 1,
      'La taille d’une position se calcule à partir de…',
      ['le risque accepté et la distance au stop-loss', 'le seul capital disponible', 'la volatilité du chat'],
      0, 'Taille = risque accepté / distance au stop.',
    ],
    [
      'acad0009-0000-4000-8000-000000000048',
      QUIZ.risque4, 2,
      'Trop dimensionner une position expose à…',
      ['un drawdown important si le trade échoue', 'un gain garanti', 'une réduction des frais'],
      0, 'Une position trop importante amplifie les pertes.',
    ],
    [
      'acad0009-0000-4000-8000-000000000049',
      QUIZ.risque4, 3,
      'Que se passe-t-il si on mise 20 % de son capital sur un seul trade perdant ?',
      ['On subit un drawdown de 20 %', 'On gagne 20 %', 'Rien, c’est sans risque'],
      0, 'Miser 20 % sur un trade perdant creuse immédiatement le drawdown.',
    ],
    [
      'acad0009-0000-4000-8000-000000000050',
      QUIZ.risque4, 4,
      'La règle des 1 % signifie…',
      ['ne pas risquer plus de 1 % du capital par trade', 'gagner au moins 1 % par trade', 'détenir 1 % de cash'],
      0, 'Limiter le risque à 1 % par position préserve le capital sur le long terme.',
    ],

    // === Risque 5 : Drawdown en pratique ===
    [
      'acad0009-0000-4000-8000-000000000051',
      QUIZ.risque5, 0,
      'Un drawdown de 20 % nécessite quel rendement pour revenir au point de départ ?',
      ['25 %', '20 %', '10 %'],
      0, 'Après une perte de 20 %, il faut +25 % pour retrouver le capital initial.',
    ],
    [
      'acad0009-0000-4000-8000-000000000052',
      QUIZ.risque5, 1,
      'Le drawdown maximal est important car il mesure…',
      ['la pire période de sous-performance', 'le gain moyen', 'la liquidité'],
      0, 'Il montre la plus grosse baisse qu’aurait subie un investisseur.',
    ],
    [
      'acad0009-0000-4000-8000-000000000053',
      QUIZ.risque5, 2,
      'Pour limiter le drawdown, on peut…',
      ['diversifier et utiliser des stop-loss', 'concentrer ses positions', 'ignorer le risque'],
      0, 'La diversification et les stops limitent les baisses du portefeuille.',
    ],
    [
      'acad0009-0000-4000-8000-000000000054',
      QUIZ.risque5, 3,
      'Le drawdown s’exprime généralement…',
      ['en pourcentage du capital', 'en euros fixes', 'en nombre d’ordres'],
      0, 'Le drawdown est une fraction du capital, donc un pourcentage.',
    ],
    [
      'acad0009-0000-4000-8000-000000000055',
      QUIZ.risque5, 4,
      'Un drawdown de 50 % est récupérable avec…',
      ['100 % de rendement', '50 % de rendement', '25 % de rendement'],
      0, 'Après -50 %, il faut doubler son capital (+100 %) pour revenir au départ.',
    ],

    // === Risque 6 : Synthèse ===
    [
      'acad0009-0000-4000-8000-000000000056',
      QUIZ.risque6, 0,
      'Quel outil permet de limiter la perte d’une position ?',
      ['Le stop-loss', 'L’ordre au marché', 'Le take-profit'],
      0, 'Le stop-loss ferme la position automatiquement au-delà d’une perte définie.',
    ],
    [
      'acad0009-0000-4000-8000-000000000057',
      QUIZ.risque6, 1,
      'Le ratio de Sharpe mesure…',
      ['la performance ajustée du risque', 'le seul rendement', 'la liquidité'],
      0, 'Il compare le rendement excédentaire à la volatilité.',
    ],
    [
      'acad0009-0000-4000-8000-000000000058',
      QUIZ.risque6, 2,
      'Après une perte de 10 %, il faut quel rendement pour revenir au départ ?',
      ['~11,1 %', '10 %', '5 %'],
      0, '1 / 0,9 − 1 ≈ 0,111, soit +11,1 %.',
    ],
    [
      'acad0009-0000-4000-8000-000000000059',
      QUIZ.risque6, 3,
      'Risquer 1 % par position permet de…',
      ['survivre à de longues séries de pertes', 'garantir des gains', 'éviter tout drawdown'],
      0, 'Avec 1 % par trade, même 10 pertes consécutives ne font qu’environ -10 %.',
    ],
    [
      'acad0009-0000-4000-8000-000000000060',
      QUIZ.risque6, 4,
      'La VaR 95 % est une estimation de…',
      ['la perte maximale dans 95 % des cas', 'du gain garanti', 'de la volatilité'],
      0, 'Dans 95 % des scénarios, la perte ne dépasse pas la VaR.',
    ],

    // === Portefeuille 1 : Diversification ===
    [
      'acad0009-0000-4000-8000-000000000061',
      QUIZ.portefeuille1, 0,
      'Répartir le capital entre plusieurs actifs permet de…',
      ['réduire le risque spécifique', 'supprimer tout risque', 'garantir un gain'],
      0, 'La répartition dilue le risque propre à chaque actif.',
    ],
    [
      'acad0009-0000-4000-8000-000000000062',
      QUIZ.portefeuille1, 1,
      'L’exposition d’une ligne correspond à…',
      ['la part du capital investie sur cet actif', 'la durée de détention', 'le nombre d’ordres passés'],
      0, 'L’exposition est le poids de la position dans le portefeuille.',
    ],
    [
      'acad0009-0000-4000-8000-000000000063',
      QUIZ.portefeuille1, 2,
      'Une corrélation faible entre deux actifs…',
      ['améliore la diversification', 'augmente le risque global', 'supprime le drawdown'],
      0, 'Des actifs peu corrélés se compensent partiellement entre eux.',
    ],
    [
      'acad0009-0000-4000-8000-000000000064',
      QUIZ.portefeuille1, 3,
      'La diversification ne supprime pas…',
      ['le risque de marché', 'le risque spécifique', 'le risque de concentration'],
      0, 'La diversification réduit le risque spécifique mais pas le risque de marché.',
    ],
    [
      'acad0009-0000-4000-8000-000000000065',
      QUIZ.portefeuille1, 4,
      'Un portefeuille de 10 actifs non corrélés a un risque spécifique…',
      ['plus faible qu’un portefeuille d’un seul actif', 'identique', 'plus élevé'],
      0, 'Plus il y a d’actifs peu corrélés, plus le risque spécifique diminue.',
    ],

    // === Portefeuille 2 : Exposition et corrélation ===
    [
      'acad0009-0000-4000-8000-000000000066',
      QUIZ.portefeuille2, 0,
      'Pourquoi limiter l’exposition par actif ?',
      ['Éviter qu’un actif décide seul du sort du portefeuille', 'Payer moins de frais', 'Trader plus souvent'],
      0, 'Une exposition plafonnée évite la dépendance à une seule ligne.',
    ],
    [
      'acad0009-0000-4000-8000-000000000067',
      QUIZ.portefeuille2, 1,
      'Le rebalancement d’un portefeuille consiste à…',
      ['revenir aux pondérations cibles', 'vendre tout en fin de séance', 'changer de courtier'],
      0, 'On réajuste les poids pour retrouver l’allocation visée.',
    ],
    [
      'acad0009-0000-4000-8000-000000000068',
      QUIZ.portefeuille2, 2,
      'Le risque de concentration désigne…',
      ['une exposition trop forte sur un même actif', 'un excès de diversification', 'une erreur d’affichage'],
      0, 'Trop concentrer le portefeuille expose à la contre-performance d’un seul actif.',
    ],
    [
      'acad0009-0000-4000-8000-000000000069',
      QUIZ.portefeuille2, 3,
      'Deux actifs parfaitement corrélés…',
      ['ne diversifient pas le portefeuille', 'réduisent le risque à zéro', 'garantissent un gain'],
      0, 'Une corrélation de 1 signifie que les deux actifs bougent à l’identique.',
    ],
    [
      'acad0009-0000-4000-8000-000000000070',
      QUIZ.portefeuille2, 4,
      'Une corrélation négative entre deux actifs permet de…',
      ['réduire la volatilité globale', 'augmenter le risque', 'supprimer les frais'],
      0, 'Quand un actif monte et l’autre descend, ils se compensent.',
    ],

    // === Portefeuille 3 : Construction ===
    [
      'acad0009-0000-4000-8000-000000000071',
      QUIZ.portefeuille3, 0,
      'Une allocation 60/40 correspond à…',
      ['60 % actions, 40 % obligations', '60 % cash, 40 % actions', '60 % un actif, 40 % un autre'],
      0, 'C’est une allocation classique : actions et obligations.',
    ],
    [
      'acad0009-0000-4000-8000-000000000072',
      QUIZ.portefeuille3, 1,
      'Construire un portefeuille, c’est d’abord…',
      ['définir son allocation cible', 'acheter les actifs les plus chers', 'vendre tout régulièrement'],
      0, 'L’allocation cible guide les achats et le rebalancement.',
    ],
    [
      'acad0009-0000-4000-8000-000000000073',
      QUIZ.portefeuille3, 2,
      'La diversification optimale cherche à…',
      ['maximiser le rendement pour un risque donné', 'minimiser le nombre d’actifs', 'maximiser la concentration'],
      0, 'On cherche la frontière efficiente : meilleur rendement au risque donné.',
    ],
    [
      'acad0009-0000-4000-8000-000000000074',
      QUIZ.portefeuille3, 3,
      'Quel est l’intérêt d’ajouter des actifs peu corrélés ?',
      ['Réduire la volatilité sans réduire trop le rendement', 'Augmenter les frais', 'Réduire la liquidité'],
      0, 'La diversification améliore le ratio rendement/risque.',
    ],
    [
      'acad0009-0000-4000-8000-000000000075',
      QUIZ.portefeuille3, 4,
      'Un portefeuille trop diversifié risque de…',
      ['diluer le rendement et augmenter les frais', 'supprimer tout risque', 'garantir des gains'],
      0, 'Trop d’actifs dilue la performance et complique la gestion.',
    ],

    // === Portefeuille 4 : Rebalancement ===
    [
      'acad0009-0000-4000-8000-000000000076',
      QUIZ.portefeuille4, 0,
      'Le rebalancement permet de…',
      ['revenu à l’allocation cible', 'augmenter systématiquement le risque', 'vendre les positions gagnantes uniquement'],
      0, 'On ramène les pondérations à leurs valeurs initiales.',
    ],
    [
      'acad0009-0000-4000-8000-000000000077',
      QUIZ.portefeuille4, 1,
      'Quand rebalancer ?',
      ['Quand les écarts à l’allocation cible dépassent un seuil', 'Toutes les minutes', 'Jamais'],
      0, 'On rebalance quand l’écart devient trop important (par ex. ±5 %).',
    ],
    [
      'acad0009-0000-4000-8000-000000000078',
      QUIZ.portefeuille4, 2,
      'Le rebalancement vend mécaniquement…',
      ['les actifs qui ont monté, pour acheter ceux qui ont baissé', 'les actifs qui ont baissé', 'tout le portefeuille'],
      0, 'C’est une discipline « vendre les gagnants, acheter les perdants ».',
    ],
    [
      'acad0009-0000-4000-8000-000000000079',
      QUIZ.portefeuille4, 3,
      'Un rebalancement trop fréquent risque de…',
      ['générer des frais inutiles', 'supprimer le risque', 'garantir le rendement'],
      0, 'Chaque réajustement a un coût (frais, spread).',
    ],
    [
      'acad0009-0000-4000-8000-000000000080',
      QUIZ.portefeuille4, 4,
      'Le rebalancement contribue à…',
      ['maîtriser le risque du portefeuille', 'augmenter la concentration', 'ignorer la volatilité'],
      0, 'En ramenant les pondérations à la cible, on contrôle l’exposition.',
    ],

    // === Portefeuille 5 : Concentration ===
    [
      'acad0009-0000-4000-8000-000000000081',
      QUIZ.portefeuille5, 0,
      'Un portefeuille concentré sur un seul actif expose à…',
      ['un risque spécifique très élevé', 'aucun risque', 'un rendement garanti'],
      0, 'Sans diversification, la contre-performance de l’actif frappe tout le portefeuille.',
    ],
    [
      'acad0009-0000-4000-8000-000000000082',
      QUIZ.portefeuille5, 1,
      'Le risque de concentration est plus élevé quand…',
      ['un seul actif représente plus de 30 % du portefeuille', 'le portefeuille a 20 actifs', 'tous les actifs sont peu corrélés'],
      0, 'Une ligne dominante détermine la performance globale.',
    ],
    [
      'acad0009-0000-4000-8000-000000000083',
      QUIZ.portefeuille5, 2,
      'Pour réduire la concentration, on peut…',
      ['répartir le capital sur plusieurs actifs', 'augmenter la taille de la plus grosse position', 'vendre tous les actifs'],
      0, 'La répartition réduit le poids de chaque ligne.',
    ],
    [
      'acad0009-0000-4000-8000-000000000084',
      QUIZ.portefeuille5, 3,
      'Une exposition maximale par actif de 20 % signifie que…',
      ['aucune ligne ne peut dépasser 20 % du capital', 'chaque ligne fait 20 %', 'le portefeuille a 5 actifs'],
      0, 'C’est un plafond, pas une obligation d’avoir 5 actifs.',
    ],
    [
      'acad0009-0000-4000-8000-000000000085',
      QUIZ.portefeuille5, 4,
      'La règle « ne pas mettre tous ses œufs dans le même panier » illustre…',
      ['la diversification', 'la concentration', 'le leverage'],
      0, 'C’est la définition même de la diversification.',
    ],

    // === Portefeuille 6 : Synthèse ===
    [
      'acad0009-0000-4000-8000-000000000086',
      QUIZ.portefeuille6, 0,
      'La diversification réduit principalement…',
      ['le risque spécifique', 'le risque de marché', 'les frais'],
      0, 'Elle atténue le risque propre à chaque actif.',
    ],
    [
      'acad0009-0000-4000-8000-000000000087',
      QUIZ.portefeuille6, 1,
      'Limiter l’exposition par actif évite…',
      ['la dépendance à une seule ligne', 'la diversification', 'le rebalancement'],
      0, 'Aucun actif ne décide seul de la performance du portefeuille.',
    ],
    [
      'acad0009-0000-4000-8000-000000000088',
      QUIZ.portefeuille6, 2,
      'Le rebalancement sert à…',
      ['revenu aux pondérations cibles', 'augmenter la concentration', 'vendre les positions perdantes'],
      0, 'Il maintient l’allocation initiale dans le temps.',
    ],
    [
      'acad0009-0000-4000-8000-000000000089',
      QUIZ.portefeuille6, 3,
      'Des actifs peu corrélés améliorent…',
      ['le ratio rendement/risque', 'les frais', 'la concentration'],
      0, 'Ils réduisent la volatilité globale pour un même rendement.',
    ],
    [
      'acad0009-0000-4000-8000-000000000090',
      QUIZ.portefeuille6, 4,
      'Trop diversifier peut…',
      ['diluer le rendement', 'supprimer le risque', 'garantir un gain'],
      0, 'Un excès d’actifs dilue la performance et complique la gestion.',
    ],

    // === Stratégies 1 : Marché baissier ===
    [
      'acad0009-0000-4000-8000-000000000091',
      QUIZ.strategies1, 0,
      'En marché baissier, une couverture (hedge) sert à…',
      ['compenser une partie des pertes du portefeuille', 'augmenter le levier sans limite', 'supprimer les frais'],
      0, 'Une couverture prend une position inverse pour amortir la baisse.',
    ],
    [
      'acad0009-0000-4000-8000-000000000092',
      QUIZ.strategies1, 1,
      'Se positionner vendeur (short) expose à…',
      ['une perte potentiellement illimitée', 'une perte bornée à la mise', 'aucun risque'],
      0, 'À la vente à découvert, la hausse du prix n’a pas de plafond : la perte non plus.',
    ],
    [
      'acad0009-0000-4000-8000-000000000093',
      QUIZ.strategies1, 2,
      'Réduire l’exposition en marché baissier permet de…',
      ['limiter l’ampleur du drawdown', 'garantir un gain', 'payer plus de dividendes'],
      0, 'Moins exposé, on subit une baisse plus faible.',
    ],
    [
      'acad0009-0000-4000-8000-000000000094',
      QUIZ.strategies1, 3,
      'Un marché baissier est caractérisé par…',
      ['une tendance de prix à la baisse', 'des volumes nuls', 'une volatilité nulle'],
      0, 'Les prix baissent de manière soutenue.',
    ],
    [
      'acad0009-0000-4000-8000-000000000095',
      QUIZ.strategies1, 4,
      'Quelle stratégie est adaptée en marché baissier ?',
      ['Réduire l’exposition et couvrir', 'Augmenter la taille des positions', 'Ignorer la tendance'],
      0, 'On réduit le risque et on amortit la baisse par des couvertures.',
    ],

    // === Stratégies 2 : Volatilité et scénarios ===
    [
      'acad0009-0000-4000-8000-000000000096',
      QUIZ.strategies2, 0,
      'Que mesure la volatilité annualisée ?',
      ['L’ampleur des variations d’un actif sur un an', 'Le rendement garanti', 'Le nombre de séances'],
      0, 'La volatilité annualisée quantifie l’intensité des variations sur un an.',
    ],
    [
      'acad0009-0000-4000-8000-000000000097',
      QUIZ.strategies2, 1,
      'Un scénario de crise sert à…',
      ['tester la robustesse de la stratégie', 'garantir des profits', 'réduire les frais'],
      0, 'On éprouve la stratégie dans des conditions de marché extrêmes.',
    ],
    [
      'acad0009-0000-4000-8000-000000000098',
      QUIZ.strategies2, 2,
      'Une volatilité élevée signifie que…',
      ['les prix varient fortement', 'le rendement est garanti', 'la liquidité est nulle'],
      0, 'Plus la volatilité est haute, plus les mouvements sont amples.',
    ],
    [
      'acad0009-0000-4000-8000-000000000099',
      QUIZ.strategies2, 3,
      'Dans un scénario de stress, on cherche à…',
      ['vérifier que le portefeuille résiste', 'maximiser le levier', 'supprimer les stops'],
      0, 'Les scénarios de stress testent la résilience du portefeuille.',
    ],
    [
      'acad0009-0000-4000-8000-000000000100',
      QUIZ.strategies2, 4,
      'La volatilité est utile pour…',
      ['dimensionner le risque d’une position', 'prédire le sens du marché', 'calculer les frais'],
      0, 'Une volatilité plus élevée implique un risque plus grand pour une même taille.',
    ],

    // === Stratégies 3 : Couverture ===
    [
      'acad0009-0000-4000-8000-000000000101',
      QUIZ.strategies3, 0,
      'Une couverture (hedge) est une position destinée à…',
      ['compenser les pertes d’une autre position', 'augmenter l’exposition', 'générer des frais'],
      0, 'La couverture prend le sens inverse pour amortir les pertes.',
    ],
    [
      'acad0009-0000-4000-8000-000000000102',
      QUIZ.strategies3, 1,
      'Se couvrir a généralement pour effet de…',
      ['réduire les pertes mais aussi les gains potentiels', 'garantir un gain', 'supprimer tout risque'],
      0, 'La couverture a un coût : elle limite aussi la hausse.',
    ],
    [
      'acad0009-0000-4000-8000-000000000103',
      QUIZ.strategies3, 2,
      'Une couverture parfaite est celle où…',
      ['la position couvrante compense exactement la position principale', 'la couverture génère du gain', 'il n’y a pas de frais'],
      0, 'La couverture parfaite annule le risque (et le gain) de la position.',
    ],
    [
      'acad0009-0000-4000-8000-000000000104',
      QUIZ.strategies3, 3,
      'La couverture est particulièrement utile…',
      ['en période de forte incertitude', 'quand le marché est stable', 'pour éviter de trader'],
      0, 'En période de stress, la couverture protège le capital.',
    ],
    [
      'acad0009-0000-4000-8000-000000000105',
      QUIZ.strategies3, 4,
      'Le coût d’une couverture correspond à…',
      ['la réduction du gain potentiel et les frais', 'un gain garanti', 'aucun coût'],
      0, 'Se couvrir réduit la performance à la hausse et implique des frais.',
    ],

    // === Stratégies 4 : Vente à découvert ===
    [
      'acad0009-0000-4000-8000-000000000106',
      QUIZ.strategies4, 0,
      'Vendre à découvert (short) consiste à…',
      ['vendre un actif que l’on ne détient pas, pour le racheter moins cher', 'vendre un actif que l’on détient', 'acheter un actif pour le vendre plus cher'],
      0, 'On vend d’abord (emprunté), puis on rachete pour restituer.',
    ],
    [
      'acad0009-0000-4000-8000-000000000107',
      QUIZ.strategies4, 1,
      'Le risque maximum en position courte est…',
      ['théoriquement illimité', 'borné à la mise', 'nul'],
      0, 'Le prix peut monter indéfiniment, donc la perte aussi.',
    ],
    [
      'acad0009-0000-4000-8000-000000000108',
      QUIZ.strategies4, 2,
      'En short, on gagne si…',
      ['le prix baisse', 'le prix monte', 'le prix ne bouge pas'],
      0, 'On revend moins cher que le prix de vente initial.',
    ],
    [
      'acad0009-0000-4000-8000-000000000109',
      QUIZ.strategies4, 3,
      'Le short squeeze désigne…',
      ['une hausse brutale qui force les vendeurs à découvert à racheter', 'une baisse des prix', 'un arrêt de la séance'],
      0, 'La hausse force les shorts à couvrir, ce qui amplifie la montée.',
    ],
    [
      'acad0009-0000-4000-8000-000000000110',
      QUIZ.strategies4, 4,
      'Pour limiter le risque en short, on peut…',
      ['placer un stop-loss d’achat', 'ne pas utiliser de stop', 'augmenter la taille'],
      0, 'Le stop d’achat rachète automatiquement si le prix monte trop.',
    ],

    // === Stratégies 5 : Momentum ===
    [
      'acad0009-0000-4000-8000-000000000111',
      QUIZ.strategies5, 0,
      'Le momentum consiste à…',
      ['suivre une tendance en cours', 'acheter systématiquement au plus bas', 'ignorer les prix'],
      0, 'On se positionne dans le sens de la tendance établie.',
    ],
    [
      'acad0009-0000-4000-8000-000000000112',
      QUIZ.strategies5, 1,
      'Une stratégie momentum suppose que…',
      ['les tendances ont tendance à se poursuivre', 'les prix reviennent toujours à la moyenne', 'la volatilité est nulle'],
      0, 'Le momentum parie sur la persistance des tendances.',
    ],
    [
      'acad0009-0000-4000-8000-000000000113',
      QUIZ.strategies5, 2,
      'Le momentum est souvent mesuré par…',
      ['la performance passée sur une fenêtre donnée', 'le seul prix actuel', 'le nombre d’ordres'],
      0, 'On compare le rendement passé récent pour détecter la tendance.',
    ],
    [
      'acad0009-0000-4000-8000-000000000114',
      QUIZ.strategies5, 3,
      'Le risque principal du momentum est…',
      ['un retournement brutal de tendance', 'la liquidité nulle', 'les frais faibles'],
      0, 'Quand la tendance s’inverse, les positions momentum sont exposées.',
    ],
    [
      'acad0009-0000-4000-8000-000000000115',
      QUIZ.strategies5, 4,
      'Pour gérer le risque en momentum, on utilise…',
      ['un stop-loss suiveur (trailing stop)', 'aucun stop', 'des positions de taille croissante'],
      0, 'Le trailing stop suit la tendance et se resserre au fur et à mesure du gain.',
    ],

    // === Stratégies 6 : Synthèse ===
    [
      'acad0009-0000-4000-8000-000000000116',
      QUIZ.strategies6, 0,
      'En marché baissier, réduire l’exposition permet de…',
      ['limiter le drawdown', 'garantir un gain', 'supprimer la volatilité'],
      0, 'Moins exposé, on subit une baisse plus faible.',
    ],
    [
      'acad0009-0000-4000-8000-000000000117',
      QUIZ.strategies6, 1,
      'Le short est une stratégie qui profite de…',
      ['la baisse des prix', 'la hausse des prix', 'la stabilité'],
      0, 'En vendu à découvert, on gagne quand le prix baisse.',
    ],
    [
      'acad0009-0000-4000-8000-000000000118',
      QUIZ.strategies6, 2,
      'Une couverture a pour effet de…',
      ['limiter les pertes ET les gains', 'garantir des gains', 'supprimer les frais'],
      0, 'Elle amortit la baisse mais capte aussi une partie de la hausse.',
    ],
    [
      'acad0009-0000-4000-8000-000000000119',
      QUIZ.strategies6, 3,
      'Le momentum parie sur…',
      ['la poursuite des tendances', 'le retour à la moyenne', 'la volatilité nulle'],
      0, 'On suit la tendance en cours.',
    ],
    [
      'acad0009-0000-4000-8000-000000000120',
      QUIZ.strategies6, 4,
      'Le risque du short est potentiellement illimité car…',
      ['le prix peut monter sans plafond', 'les frais sont illimités', 'la liquidité est infinie'],
      0, 'Contrairement à l’achat (perte bornée au capital investi), le short n’a pas de borne haute.',
    ],
  ];

  await insertRows(
    dataSource,
    'academy_quiz_questions',
    ['id', 'quiz_id', 'position', 'prompt', 'options', 'correct_index', 'explanation'],
    questions,
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
    console.log('Seed Academy terminé : contenu vidéo + 6 quizzes par cours insérés (sans doublon).');
  } catch (error) {
    console.error('Erreur lors du seed Academy :', error);
  } finally {
    await dataSource.destroy();
  }
}

void main();
