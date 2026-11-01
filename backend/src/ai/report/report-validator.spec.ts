import { describe, expect, it } from 'vitest';
import { UserRole } from '../../users/user-role.enum.js';
import { buildParticipantContext } from '../context/ai-context.js';
import { buildPanicTuesday } from '../fixtures/panic-tuesday.js';
import { computeMetrics } from '../metrics/metrics.js';
import { scoreParticipant } from '../rubric/rubric.js';
import { buildFallbackParts } from './fallback-report.js';
import { numbersIn, validateReportParts } from './report-validator.js';

const session = buildPanicTuesday();
const teacher = { id: 'prof', role: UserRole.GAME_MASTER };
// Amine : exposition 91,8 % dès la minute 5 (exécution a1), drawdown 2,754 %, aucune réaction.
const context = buildParticipantContext(session, 'user-amine', teacher);
const { criteria, overall } = scoreParticipant(computeMetrics(session, 'user-amine'));

const validParts = () => ({
  summary: 'Vous avez engagé 91,8 % du capital dès la minute 5 et vous n’avez pas réagi à la NEWS.',
  criteria: [
    { id: 'gestion_risque', comment: 'Exposition maximale de 91,8 % : au-delà de 80 %, c’est insuffisant.', evidence: [{ type: 'trade', id: 'a1' }, { type: 'minute', value: 5 }] },
    { id: 'maitrise_pertes', comment: 'Votre perte maximale est de 2,75 % au creux de la minute 22.', evidence: [{ type: 'minute', value: 22 }] },
    { id: 'protection_positions', comment: 'Aucune position protégée par un stop-loss.', evidence: [{ type: 'trade', id: 'a1' }] },
    { id: 'reactivite', comment: 'Aucune exécution après la NEWS de la minute 11.', evidence: [{ type: 'event', id: 'ev-news' }] },
  ],
  strengths: [{ text: 'Perte maximale limitée à 2,8 %.', evidence: [{ type: 'minute', value: 22 }] }],
  improvements: [{ text: 'Poser un stop-loss sur la position ouverte à la minute 5.', evidence: [{ type: 'trade', id: 'a1' }] }],
});
const run = (parts: unknown) => validateReportParts(JSON.stringify(parts), context, criteria, overall);
const codes = (parts: unknown) => run(parts).issues.map((i) => i.code);

describe('validateReportParts — rapport conforme', () => {
  it('accepte un rapport dont les chiffres, preuves et critères sont exacts', () => {
    const result = run(validParts());
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('accepte du JSON entouré de balises markdown', () => {
    const text = '```json\n' + JSON.stringify(validParts()) + '\n```';
    expect(validateReportParts(text, context, criteria).ok).toBe(true);
  });

  it('accepte un arrondi à la précision écrite (92 pour 91,8)', () => {
    const parts = validParts();
    parts.summary = 'Vous avez engagé 92 % du capital.';
    expect(run(parts).ok).toBe(true);
  });

  it('accepte les prix écrits avec espaces (2 700 et 2 619)', () => {
    const parts = validParts();
    parts.summary = 'Le prix est passé de 2 700 à 2 619 pendant la séance.';
    expect(run(parts).ok).toBe(true);
  });
});

describe('validateReportParts — hallucinations refusées', () => {
  it('refuse un chiffre inventé', () => {
    const parts = validParts();
    parts.summary = 'Vous avez engagé 95 % du capital.';
    expect(codes(parts)).toContain('number_mismatch');
  });

  it('refuse un chiffre trop éloigné (4 % pour 2,754 %)', () => {
    const parts = validParts();
    parts.criteria[1]!.comment = 'Votre perte maximale est de 4 %.';
    expect(codes(parts)).toContain('number_mismatch');
  });

  it('refuse une exécution inexistante', () => {
    const parts = validParts();
    parts.criteria[0]!.evidence = [{ type: 'trade', id: 'zzz' }];
    expect(codes(parts)).toContain('unknown_evidence');
  });

  it('refuse une minute hors séance et un événement inconnu', () => {
    const parts = validParts();
    parts.improvements[0]!.evidence = [{ type: 'minute', value: 99 }, { type: 'event', id: 'ev-fantome' }] as never;
    expect(codes(parts).filter((c) => c === 'unknown_evidence')).toHaveLength(2);
  });

  it('refuse un commentaire sans preuve pour un critère évalué', () => {
    const parts = validParts();
    parts.criteria[0]!.evidence = [];
    expect(codes(parts)).toContain('missing_evidence');
  });

  it('refuse un point fort sans preuve', () => {
    const parts = validParts();
    parts.strengths[0]!.evidence = [];
    expect(codes(parts)).toContain('missing_evidence');
  });

  it('refuse l’oubli d’un critère évalué', () => {
    const parts = validParts();
    parts.criteria.pop();
    expect(codes(parts)).toContain('missing_criterion');
  });

  it('refuse un critère inconnu ou commenté deux fois', () => {
    const parts = validParts();
    parts.criteria.push({ id: 'inventé', comment: 'x', evidence: [] }, { ...parts.criteria[0]! });
    const found = codes(parts);
    expect(found).toContain('unknown_criterion');
    expect(found).toContain('duplicate_criterion');
  });
});

describe('validateReportParts — forme et sécurité', () => {
  it('refuse du texte non JSON', () => {
    expect(validateReportParts('Voici le bilan : tout va bien', context, criteria).issues[0]!.code).toBe('invalid_json');
  });

  it('refuse un résumé vide ou un tableau manquant', () => {
    expect(codes({ summary: '', criteria: 'x' })).toEqual(expect.arrayContaining(['invalid_shape']));
  });

  it('refuse un conseil d’investissement ou une prévision', () => {
    for (const phrase of ['Achetez davantage d’or.', 'Je vous conseille de renforcer.', 'Le prix va monter demain.']) {
      const parts = validParts();
      parts.improvements[0]!.text = phrase;
      expect(codes(parts), phrase).toContain('forbidden_advice');
    }
  });

  it('refuse des textes trop longs', () => {
    const parts = validParts();
    parts.summary = 'a'.repeat(900);
    expect(codes(parts)).toContain('too_long');
  });

  it('accepte une valeur de note ou de barème citée (1 sur 4)', () => {
    const parts = validParts();
    parts.criteria[0]!.comment = 'La note de 1 sur 4 s’explique par 91,8 %.';
    expect(run(parts).ok).toBe(true);
  });
});

describe('numbersIn', () => {
  it('lit les formats français et anglais', () => {
    expect(numbersIn('2 700 $ et 91,8 % puis 0.5').map((n) => n.value)).toEqual([2700, 91.8, 0.5]);
    expect(numbersIn('minute 14').map((n) => n.value)).toEqual([14]);
  });
});

describe('texte de secours généré par le code', () => {
  it('passe le même validateur : il est fidèle aux données', () => {
    const parts = buildFallbackParts(criteria, overall);
    const result = validateReportParts(JSON.stringify(parts), context, criteria, overall);
    expect(result.issues).toEqual([]);
  });
});
