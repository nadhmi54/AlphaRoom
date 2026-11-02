export interface ScenarioKeypoint {
  minute: number; // 0 à 30
  price: number;
  newsTitle?: string;
  newsDescription?: string;
  eventType?: string;
  spreadMultiplier?: number;
}

export const PANIC_TUESDAY_SCENARIO = {
  id: 'panic_tuesday',
  name: 'Le mardi de la panique',
  symbol: 'XAU/USD',
  durationMinutes: 30,
  initialPrice: 2700.0,
  initialCash: 100000.0,
  description:
    'Scénario pédagogique de 30 minutes sur XAU/USD : phase de calme initiale, news macroéconomique à la minute 11, et choc de panique baissière à la minute 22.',
  keypoints: [
    { minute: 0, price: 2700.0 },
    { minute: 3, price: 2700.8 },
    { minute: 6, price: 2698.4 },
    { minute: 9, price: 2700.2 },
    { minute: 10, price: 2699.5 },
    {
      minute: 11,
      price: 2693.0,
      newsTitle: 'COMMUNIQUÉ : Déclaration inattendue sur les rendements obligataires',
      newsDescription: 'Vague de prises de bénéfices sur l’or suite à des déclarations fermes de banquiers centraux.',
      eventType: 'NEWS',
      spreadMultiplier: 1.5,
    },
    { minute: 14, price: 2692.1 },
    { minute: 16, price: 2696.0 },
    { minute: 19, price: 2694.5 },
    { minute: 21, price: 2691.0 },
    {
      minute: 22,
      price: 2620.0,
      newsTitle: 'FLASH CRASH : Débouclage massif de positions institutionnelles',
      newsDescription: 'Cascade d’appels de marge et ordres de vente algorithmiques. Liquidité fortement réduite.',
      eventType: 'PRICE_SHOCK',
      spreadMultiplier: 4.0,
    },
    { minute: 23, price: 2618.5 },
    { minute: 25, price: 2640.0 },
    { minute: 27, price: 2636.5 },
    { minute: 30, price: 2638.0 },
  ] as ScenarioKeypoint[],
};

/**
 * Calcule le prix exact pour un nombre de secondes écoulées (0 à 1800).
 * Interpolation fluide entre les keypoints + micro-variation déterministe basée sur le sinus.
 */
export function calculateScenarioPrice(
  elapsedSeconds: number,
  manualShockOffset: number = 0,
): { price: number; currentMinute: number; spread: number } {
  const totalSeconds = PANIC_TUESDAY_SCENARIO.durationMinutes * 60;
  const clampedSeconds = Math.max(0, Math.min(elapsedSeconds, totalSeconds));
  const currentMinute = clampedSeconds / 60;

  const keypoints = PANIC_TUESDAY_SCENARIO.keypoints;
  let lower = keypoints[0];
  let upper = keypoints[keypoints.length - 1];

  for (let i = 0; i < keypoints.length - 1; i++) {
    if (currentMinute >= keypoints[i].minute && currentMinute <= keypoints[i + 1].minute) {
      lower = keypoints[i];
      upper = keypoints[i + 1];
      break;
    }
  }

  const range = upper.minute - lower.minute || 1;
  const progress = (currentMinute - lower.minute) / range;
  // Interpolation cosine plus douce qu'une ligne brisée
  const smoothProgress = (1 - Math.cos(progress * Math.PI)) / 2;
  const basePrice = lower.price + (upper.price - lower.price) * smoothProgress;

  // Micro-bruit déterministe (pseudo-aléatoire sans dérive) pour l'effet de cotation vivante
  const microNoise = Math.sin(clampedSeconds * 1.35) * 0.35 + Math.cos(clampedSeconds * 0.72) * 0.22;

  const finalPrice = Math.round((basePrice + microNoise + manualShockOffset) * 100) / 100;

  // Calcul du spread simulé (en $), normalement 0.20$ à 0.40$, élargi lors des chocs
  let spreadMultiplier = lower.spreadMultiplier ?? 1.0;
  if (upper.spreadMultiplier && upper.spreadMultiplier > spreadMultiplier) {
    spreadMultiplier = spreadMultiplier + (upper.spreadMultiplier - spreadMultiplier) * progress;
  }
  const spread = Math.round(0.25 * spreadMultiplier * 100) / 100;

  return { price: finalPrice, currentMinute, spread };
}
