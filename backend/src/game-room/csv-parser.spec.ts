import { describe, expect, it } from 'vitest';
import { parseCandlesCsv } from './csv-parser.js';

const ISO_CSV = [
  'timestamp,open,high,low,close,volume',
  '2026-10-30T09:00:00Z,2700,2705,2698,2703,120',
  '2026-10-30T09:01:00Z,2703,2706,2700,2701,90',
  '2026-10-30T09:02:00Z,2701,2702,2695,2696,140',
].join('\n');

describe('Game Room - Import CSV historique', () => {
  it('lit un CSV OHLCV avec en-tête et virgules', () => {
    const result = parseCandlesCsv(ISO_CSV);
    expect(result.candles).toHaveLength(3);
    expect(result.issues).toHaveLength(0);
    expect(result.spanSeconds).toBe(120);
    expect(result.startAt).toBe('2026-10-30T09:00:00.000Z');
    expect(result.endAt).toBe('2026-10-30T09:02:00.000Z');
    expect(result.minClose).toBe(2696);
    expect(result.maxClose).toBe(2703);
  });

  it('accepte le point-virgule, la virgule décimale et les epoch millisecondes', () => {
    const result = parseCandlesCsv(
      [
        'date;open;high;low;close',
        '1761811200000;2700,5;2705;2698;2703,25',
        '1761811260000;2703,25;2706;2700;2701',
      ].join('\n'),
    );
    expect(result.candles).toHaveLength(2);
    expect(result.issues).toHaveLength(0);
    expect(result.candles[0].close).toBe(2703.25);
    expect(result.spanSeconds).toBe(60);
  });

  it('fonctionne sans en-tête (ordre timestamp,open,high,low,close)', () => {
    const result = parseCandlesCsv(
      ['2026-10-30T09:00:00Z,2700,2705,2698,2703', '2026-10-30T09:05:00Z,2703,2709,2701,2707'].join('\n'),
    );
    expect(result.candles).toHaveLength(2);
    expect(result.spanSeconds).toBe(300);
  });

  it('signale les lignes invalides avec leur numéro et garde les lignes saines', () => {
    const result = parseCandlesCsv(
      [
        'timestamp,open,high,low,close',
        '2026-10-30T09:00:00Z,2700,2705,2698,2703',
        'pas-une-date,2700,2705,2698,2703',
        '2026-10-30T09:01:00Z,-5,2705,2698,2703',
        '2026-10-30T09:02:00Z,2703,2690,2700,2701',
        '2026-10-30T09:03:00Z,2701,2704,2699,2702',
      ].join('\n'),
    );
    expect(result.candles).toHaveLength(2);
    expect(result.issues.map((issue) => issue.line)).toEqual([3, 4, 5]);
    expect(result.issues[0].message).toContain('Horodatage illisible');
    expect(result.issues[1].message).toContain('OHLC invalides');
    expect(result.issues[2].message).toContain('high');
  });

  it('ignore les horodatages en double et trie les bougies', () => {
    const result = parseCandlesCsv(
      [
        'timestamp,open,high,low,close',
        '2026-10-30T09:05:00Z,2703,2709,2701,2707',
        '2026-10-30T09:00:00Z,2700,2705,2698,2703',
        '2026-10-30T09:05:00Z,2703,2709,2701,2799',
      ].join('\n'),
    );
    expect(result.candles.map((candle) => candle.close)).toEqual([2703, 2707]);
    expect(result.issues.some((issue) => issue.message.includes('double'))).toBe(true);
  });

  it('refuse un fichier vide ou sans au moins deux bougies exploitables', () => {
    expect(parseCandlesCsv('').candles).toHaveLength(0);
    expect(parseCandlesCsv('').issues[0].message).toContain('vide');

    const single = parseCandlesCsv('timestamp,open,high,low,close\n2026-10-30T09:00:00Z,2700,2705,2698,2703');
    expect(single.candles).toHaveLength(1);
    expect(single.spanSeconds).toBeNull();
    expect(single.issues.some((issue) => issue.message.includes('deux bougies'))).toBe(true);
  });
});
