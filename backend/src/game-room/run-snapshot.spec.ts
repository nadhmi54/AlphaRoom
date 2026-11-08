import { describe, expect, it } from 'vitest';
import { eventsOfCurrentRun, type TimedEvent } from './run-snapshot.js';

const at = (iso: string) => new Date(`2026-11-02T${iso}Z`);
const ev = (id: string, type: string, minute: number, createdAt: string, target?: number): TimedEvent => ({
  id,
  type,
  title: id,
  minute,
  createdAt: at(createdAt),
  payloadTargetMinute: target,
});

describe('eventsOfCurrentRun', () => {
  it('sans rollback, garde tous les événements', () => {
    const out = eventsOfCurrentRun([ev('a', 'NEWS', 5, '10:00:00'), ev('b', 'PRICE_SHOCK', 12, '10:05:00')]);
    expect(out.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('écarte les événements de l’ancien passage postérieurs à la minute cible, et le marqueur de rollback', () => {
    const out = eventsOfCurrentRun([
      ev('avant-cible', 'NEWS', 4, '10:00:00'),
      ev('ancien-choc', 'PRICE_SHOCK', 12, '10:05:00'),
      ev('rollback', 'ROLLBACK', 15, '10:10:00', 8),
      ev('nouveau-choc', 'PRICE_SHOCK', 10, '10:12:00'),
    ]);
    expect(out.map((e) => e.id)).toEqual(['avant-cible', 'nouveau-choc']);
  });
});
