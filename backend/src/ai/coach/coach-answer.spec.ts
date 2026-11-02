import { describe, expect, it } from 'vitest';
import { buildParticipantContext } from '../context/ai-context.js';
import { buildPanicTuesday } from '../fixtures/panic-tuesday.js';
import { UserRole } from '../../users/user-role.enum.js';
import { buildRuleAnswer, detectIntent, validateCoachText } from './coach-answer.js';

const session = buildPanicTuesday();
const teacher = { id: 'prof', role: UserRole.GAME_MASTER };
const ctx = (id: string) => buildParticipantContext(session, id, teacher);

describe('détection de l’intention', () => {
  it.each([
    ['Mon risque est-il trop élevé ?', 'exposure'],
    ['Pourquoi ai-je perdu de l’argent ?', 'loss'],
    ['À quoi sert un stop-loss ?', 'protection'],
    ['Ai-je bien réagi à la news ?', 'reaction'],
    ['Comment est calculée ma note ?', 'score'],
    ['Je dois acheter ou vendre ?', 'advice'],
    ['Le prix va monter ?', 'advice'],
    ['bonjour', 'overview'],
  ])('« %s » → %s', (question, expected) => {
    expect(detectIntent(question)).toBe(expected);
  });

  it('les demandes d’avis passent avant toute autre intention', () => {
    expect(detectIntent('Mon risque est élevé, dois-je vendre ?')).toBe('advice');
  });
});

describe('réponses construites par le code', () => {
  it('exposition d’Amine : 91,8 % avec la preuve', () => {
    const answer = buildRuleAnswer(ctx('user-amine'), 'Mon risque est-il élevé ?');
    expect(answer.text).toContain('91,8 %');
    expect(answer.evidence.length).toBeGreaterThan(0);
  });

  it('perte de Karim : cite son résultat et sa baisse', () => {
    const answer = buildRuleAnswer(ctx('user-karim'), 'Pourquoi ai-je perdu ?');
    expect(answer.intent).toBe('loss');
    expect(answer.text).toMatch(/perte|gain/);
    expect(answer.text).toContain('drawdown');
  });

  it('stop-loss : Amine n’en a aucun, Sarra en a un', () => {
    expect(buildRuleAnswer(ctx('user-amine'), 'stop-loss ?').text).toContain('Aucune de tes positions');
    expect(buildRuleAnswer(ctx('user-sarra'), 'stop-loss ?').text).toMatch(/stop-loss/);
  });

  it('réaction : liste les délais, y compris l’absence de réaction', () => {
    const text = buildRuleAnswer(ctx('user-amine'), 'ai-je réagi à la news ?').text;
    expect(text).toContain('aucune exécution');
    const sarra = buildRuleAnswer(ctx('user-sarra'), 'ai-je réagi à la news ?').text;
    expect(sarra).toContain('2 minutes plus tard');
  });

  it('refuse poliment de conseiller ou de prédire', () => {
    const answer = buildRuleAnswer(ctx('user-amine'), 'Dois-je vendre maintenant ?');
    expect(answer.intent).toBe('advice');
    expect(answer.text).toContain('Je ne peux pas');
  });

  it('une étudiante sans ordre : explique qu’il n’y a rien à analyser', () => {
    const answer = buildRuleAnswer(ctx('user-lina'), 'Pourquoi ai-je perdu ?');
    expect(answer.text).toContain('aucun ordre');
  });

  it('toutes les réponses du code passent le contrôle des chiffres et des conseils', () => {
    const questions = ['risque', 'pourquoi perdu', 'stop-loss', 'réaction news', 'ma note', 'bonjour', 'dois-je acheter'];
    for (const id of ['user-amine', 'user-sarra', 'user-karim', 'user-lina']) {
      const context = ctx(id);
      for (const question of questions) {
        const { text } = buildRuleAnswer(context, question);
        expect(validateCoachText(text, context), `${id} / ${question}`).toEqual([]);
      }
    }
  });
});

describe('contrôle du texte du modèle', () => {
  const context = ctx('user-amine');

  it('accepte un texte dont les chiffres existent', () => {
    expect(validateCoachText('Ton exposition maximale a atteint 91,8 % de ton capital.', context)).toEqual([]);
  });

  it('refuse un chiffre inventé', () => {
    const issues = validateCoachText('Tu as perdu 47 % de ton capital.', context);
    expect(issues.map((i) => i.code)).toContain('number_mismatch');
  });

  it('refuse un conseil ou une prévision', () => {
    expect(validateCoachText('Je te conseille de vendre maintenant.', context).map((i) => i.code)).toContain('forbidden_advice');
    expect(validateCoachText('Le prix va baisser demain.', context).map((i) => i.code)).toContain('forbidden_advice');
  });

  it('refuse une réponse vide ou trop longue', () => {
    expect(validateCoachText('   ', context)[0]?.code).toBe('invalid_shape');
    expect(validateCoachText('a'.repeat(1600), context).map((i) => i.code)).toContain('too_long');
  });
});
