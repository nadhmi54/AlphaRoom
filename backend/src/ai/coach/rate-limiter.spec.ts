import { describe, expect, it } from 'vitest';
import { SlidingWindowLimiter } from './rate-limiter.js';

describe('SlidingWindowLimiter', () => {
  it('bloque au-delà du maximum puis libère quand la fenêtre passe', () => {
    let now = 0;
    const limiter = new SlidingWindowLimiter([{ windowMs: 1000, max: 2 }], () => now);
    expect(limiter.hit('a').ok).toBe(true);
    expect(limiter.hit('a').ok).toBe(true);
    const blocked = limiter.hit('a');
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBe(1000);
    now = 600;
    expect(limiter.hit('a').retryAfterMs).toBe(400);
    now = 1001;
    expect(limiter.hit('a').ok).toBe(true);
  });

  it('compte chaque personne séparément', () => {
    const limiter = new SlidingWindowLimiter([{ windowMs: 1000, max: 1 }], () => 0);
    expect(limiter.hit('a').ok).toBe(true);
    expect(limiter.hit('b').ok).toBe(true);
    expect(limiter.hit('a').ok).toBe(false);
  });

  it('applique la limite la plus stricte parmi plusieurs fenêtres', () => {
    let now = 0;
    const limiter = new SlidingWindowLimiter(
      [
        { windowMs: 1000, max: 5 },
        { windowMs: 10_000, max: 2 },
      ],
      () => now,
    );
    limiter.hit('a');
    now = 2000;
    limiter.hit('a');
    now = 3000;
    expect(limiter.hit('a').ok).toBe(false);
  });

  it('un appel refusé n’est pas compté', () => {
    let now = 0;
    const limiter = new SlidingWindowLimiter([{ windowMs: 1000, max: 1 }], () => now);
    limiter.hit('a');
    limiter.hit('a');
    limiter.hit('a');
    now = 1001;
    expect(limiter.hit('a').ok).toBe(true);
  });
});
