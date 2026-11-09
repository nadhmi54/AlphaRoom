// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useNewlyUnlocked } from './useNewlyUnlocked.js';

const course = (id, unlocked) => ({ id, title: id, unlocked });

describe('useNewlyUnlocked', () => {
  it('ne notifie pas au premier chargement', () => {
    const { result } = renderHook(() => useNewlyUnlocked([course('a', false), course('b', true)]));
    expect(result.current.newlyUnlocked).toHaveLength(0);
  });

  it('notifie le cours passé de verrouillé à débloqué', () => {
    const { result, rerender } = renderHook(({ courses }) => useNewlyUnlocked(courses), {
      initialProps: { courses: [course('a', false), course('b', true)] },
    });

    rerender({ courses: [course('a', true), course('b', true)] });

    expect(result.current.newlyUnlocked.map((item) => item.id)).toEqual(['a']);
  });

  it('permet d’ignorer la notification', () => {
    const { result, rerender } = renderHook(({ courses }) => useNewlyUnlocked(courses), {
      initialProps: { courses: [course('a', false)] },
    });

    rerender({ courses: [course('a', true)] });
    expect(result.current.newlyUnlocked).toHaveLength(1);

    act(() => {
      result.current.dismiss('a');
    });
    rerender({ courses: [course('a', true)] });
    expect(result.current.newlyUnlocked).toHaveLength(0);
  });
});
