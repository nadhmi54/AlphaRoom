import { formatNumber } from '../rubric/rubric.js';

/** Pourcentage lisible à partir d'une fraction (0,055 → « 5,5 % »), sans signe. */
export const pct = (fraction: number) => {
  const percent = Math.abs(fraction) * 100;
  // Moins de 1 % : deux décimales, pour ne jamais afficher « 0 % » une variation réelle.
  return `${formatNumber(percent, percent > 0 && percent < 1 ? 2 : 1)} %`;
};

/** Pourcentage avec signe typographique. */
export const signedPct = (fraction: number) => (fraction === 0 || Number(formatNumber(Math.abs(fraction) * 100, 2)) === 0 ? '0 %' : `${fraction < 0 ? '−' : '+'}${pct(fraction)}`);

/** Prix avec espaces pour les milliers (2 700, 2 619,5). */
export const price = (value: number) => {
  const [int, dec] = formatNumber(value, 2).split(',');
  return `${int!.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}${dec ? `,${dec}` : ''}`;
};
