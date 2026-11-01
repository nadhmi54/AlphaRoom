// Données de test partagées par les tests des écrans IA.

export const criterion = (overrides = {}) => ({
  id: 'gestion_risque',
  label: 'Gestion du risque',
  weight: 0.3,
  status: 'evaluated',
  value: 91.8,
  displayValue: '91,8 %',
  score: 1,
  outOf: 4,
  rule: 'Gestion du risque : 91,8 %, règle « au-delà de 80 % » → insuffisante, 1/4.',
  evidence: [{ type: 'minute', value: 5 }],
  comment: 'Tu as investi presque tout ton capital.',
  commentEvidence: [{ type: 'trade', id: 'a1' }],
  ...overrides,
});

export const sampleReport = (overrides = {}) => ({
  id: 'r1',
  sessionId: 'mardi-panique',
  run: 1,
  alias: 'etu_01',
  displayName: 'Amine B.',
  status: 'draft',
  published: false,
  participantId: 'user-amine',
  validatedAt: null,
  createdAt: '2026-11-01T10:00:00Z',
  updatedAt: '2026-11-01T10:00:00Z',
  trace: {
    source: 'rules',
    provider: 'stub',
    model: 'stub',
    promptVersion: 'v1',
    rubricVersion: 'v1',
    contextHash: 'abc123',
    temperature: 0.2,
    attempts: 1,
    usage: { inputTokens: 120, outputTokens: 30 },
    generatedAt: '2026-11-01T10:00:00Z',
    issues: [],
  },
  content: {
    alias: 'etu_01',
    session: { id: 'mardi-panique', run: 1 },
    rubric: { id: 'default', version: 'v1', outOf: 4 },
    criteria: [
      criterion(),
      criterion({
        id: 'reactivite',
        label: 'Réactivité',
        weight: 0.15,
        value: null,
        displayValue: 'aucune réaction',
        score: 0,
        rule: 'Réactivité : aucune exécution dans les 10 minutes suivant les 2 événement(s) → aucune réaction, 0/4.',
        evidence: [{ type: 'event', id: 'ev-news' }],
        comment: 'Tu n’as pas réagi à la news.',
      }),
      criterion({
        id: 'qualite_sorties',
        label: 'Qualité des sorties',
        weight: 0.15,
        status: 'not_evaluable',
        value: null,
        displayValue: null,
        score: null,
        rule: 'Qualité des sorties : non évalué.',
        reason: 'aucune position fermée',
        evidence: [],
        comment: '',
      }),
    ],
    overall: { score: 1.65, outOf: 4, evaluated: 2, total: 3, partial: true },
    summary: 'Tu as pris une position très large sans protection.',
    strengths: [{ text: 'Tu as agi tôt dans la séance.', evidence: [{ type: 'trade', id: 'a1' }] }],
    improvements: [{ text: 'Pose un stop-loss pour limiter la perte maximale.', evidence: [{ type: 'minute', value: 22 }] }],
    missingData: ['no_expected_price'],
  },
  ...overrides,
});

export const demoSession = {
  sessionId: 'mardi-panique',
  title: 'Le mardi de la panique (démo)',
  runs: [1, 2],
  latestRun: 2,
  durationMinutes: 30,
  symbols: ['XAU/USD'],
  participantCount: 4,
  joined: false,
};

export const marketResult = {
  analysis: {
    sessionId: 'mardi-panique',
    run: 1,
    durationMinutes: 30,
    symbols: [
      { symbol: 'XAU/USD', first: 2700, last: 2640, changeRate: -0.022222, min: 2619, minMinute: 22, max: 2700, maxMinute: 0, volatility: 0.004, biggestMove: { minute: 22, rate: -0.022761 } },
    ],
    events: [
      { id: 'ev-news', type: 'news', minute: 11, label: 'La Fed durcit', impacts: [{ symbol: 'XAU/USD', before: 2700, after: 2680, moveRate: -0.007407 }], participants: 4, reacted: 2 },
    ],
    highlights: [{ text: 'XAU/USD : de 2 700 à 2 640 (−2,2 %).', evidence: [{ type: 'minute', value: 22 }] }],
  },
  commentary: null,
  commentarySource: 'none',
  commentaryNote: 'Aucun modèle configuré (stub).',
};

export const replayResult = {
  analysis: {
    sessionId: 'mardi-panique',
    fromRun: 1,
    toRun: 2,
    notComparable: 0,
    headline: 'Passage 1 → passage 2 : 1 amélioré, 3 inchangés, 0 en baisse sur 4.',
    summary: { improved: 1, unchanged: 3, worsened: 0, meanScoreBefore: 2.77, meanScoreAfter: 3.55 },
    participants: [
      {
        participantId: 'user-amine',
        displayName: 'Amine B.',
        alias: 'etu_01',
        before: { overallScore: 1.65, maxExposure: 0.918 },
        after: { overallScore: 3.4, maxExposure: 0.324 },
        verdict: 'improved',
        changes: ['Exposition maximale : 91,8 % → 32,4 % du capital.'],
      },
    ],
  },
  commentary: 'Un étudiant a nettement réduit son exposition.',
  commentarySource: 'llm',
};
