import { describe, expect, it } from 'vitest';
import {
  computeCurrentLevel,
  isLevelOpen,
  levelBadgeCode,
  missionUnlockCondition,
  pickQuiz,
} from './path-logic.js';

describe('pickQuiz', () => {
  it('renvoie null quand le cours n’a aucun quiz', () => {
    expect(pickQuiz([], null)).toBeNull();
  });

  it('renvoie l’unique quiz disponible, même s’il correspond au dernier tenté', () => {
    expect(pickQuiz(['a'], 'a')).toBe('a');
  });

  it('exclut le dernier quiz tenté quand d’autres existent', () => {
    for (let i = 0; i < 20; i += 1) {
      expect(pickQuiz(['a', 'b'], 'a')).toBe('b');
    }
  });

  it('dédoublonne les identifiants de quiz', () => {
    expect(pickQuiz(['a', 'a'], 'a')).toBe('a');
    expect(pickQuiz(['a', 'a', 'b'], 'a')).toBe('b');
  });

  it('choisit toujours un index valide, même si rng atteint la borne haute', () => {
    const ids = ['a', 'b', 'c'];
    expect(pickQuiz(ids, null, () => 0)).toBe('a');
    expect(pickQuiz(ids, null, () => 1)).toBe('c');
    expect(pickQuiz(ids, null, () => 0.4)).toBe('b');
  });
});

describe('computeCurrentLevel', () => {
  it('ouvre le niveau 1 sans aucune mission réussie', () => {
    expect(computeCurrentLevel(new Set())).toBe(1);
  });

  it('avance tant que les missions des niveaux consécutifs sont réussies', () => {
    expect(computeCurrentLevel(new Set([1]))).toBe(2);
    expect(computeCurrentLevel(new Set([1, 2, 3]))).toBe(4);
  });

  it('s’arrête au premier niveau dont la mission n’est pas réussie', () => {
    expect(computeCurrentLevel(new Set([1, 3]))).toBe(2);
  });
});

describe('isLevelOpen', () => {
  it('ouvre un niveau atteint et verrouille les suivants', () => {
    expect(isLevelOpen(1, 1)).toBe(true);
    expect(isLevelOpen(2, 1)).toBe(false);
    expect(isLevelOpen(2, 3)).toBe(true);
  });

  it('traite un niveau manquant comme le niveau 1', () => {
    expect(isLevelOpen(Number.NaN, 1)).toBe(true);
  });
});

describe('levelBadgeCode', () => {
  it('réutilise le badge Débutant pour le niveau 1 et un code par niveau ensuite', () => {
    expect(levelBadgeCode(1)).toBe('DEBUTANT');
    expect(levelBadgeCode(2)).toBe('NIVEAU_2');
    expect(levelBadgeCode(4)).toBe('NIVEAU_4');
  });
});

describe('missionUnlockCondition', () => {
  it('décrit la condition selon l’état de la mission', () => {
    expect(missionUnlockCondition('locked', 2)).toContain('niveau 2');
    expect(missionUnlockCondition('available', 2)).toContain('disponible');
    expect(missionUnlockCondition('passed', 2)).toContain('réussie');
  });
});
