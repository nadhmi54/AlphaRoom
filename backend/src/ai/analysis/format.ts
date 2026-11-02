import { formatNumber } from '../rubric/rubric.js';

/** Pourcentage lisible à partir d'une fraction (0,055 → « 5,5 % »), sans signe. */
export const pct = (fraction: number) => `${formatNumber(Math.abs(fraction) * 100)} %`;

/** Pourcentage avec signe typographique. */
export const signedPct = (fraction: number) => (fraction === 0 ? '0 %' : `${fraction < 0 ? '−' : '+'}${pct(fraction)}`);

/** Prix avec espaces pour les milliers (2 700, 2 619,5). */
export const price = (value: number) => {
  const [int, dec] = formatNumber(value, 2).split(',');
  return `${int!.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}${dec ? `,${dec}` : ''}`;
};
