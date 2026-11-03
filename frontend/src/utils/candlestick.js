/**
 * Module d'agrégation et de gestion des chandeliers japonais (Candlesticks OHLC).
 *
 * Supporte :
 * - L'agrégation de ticks simples ({ t, price }) en chandeliers pour un intervalle donné.
 * - La réutilisation directe de bougies OHLC pré-existantes ({ open, high, low, close }).
 * - La mise à jour en temps réel (mise à jour de la dernière bougie ou création de la suivante).
 */

export const INTERVALS = {
  '1s':  { label: '1s',  seconds: 1   },
  '5s':  { label: '5s',  seconds: 5   },
  '15s': { label: '15s', seconds: 15  },
  '1m':  { label: '1m',  seconds: 60  },
  '5m':  { label: '5m',  seconds: 300 },
  '15m': { label: '15m', seconds: 900 },
};

/** Normalise un horodatage (string ISO, millisecondes epoch ou secondes) en secondes entières. */
export function toSeconds(t) {
  if (t === null || t === undefined) return 0;
  if (typeof t === 'number') {
    // Si la valeur est en millisecondes (> ~an 1973 en ms), on divise par 1000.
    return t > 1e11 ? Math.floor(t / 1000) : Math.floor(t);
  }
  if (typeof t === 'string') {
    const numeric = Number(t);
    if (Number.isFinite(numeric)) {
      return numeric > 1e11 ? Math.floor(numeric / 1000) : Math.floor(numeric);
    }
    const parsed = Date.parse(t);
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
  }
  return 0;
}

/**
 * Agrège une série de points en chandeliers japonais selon l'intervalle spécifié en secondes.
 *
 * @param {Array<Object>} points - Liste de points { t, price } ou { time, open, high, low, close }
 * @param {number} intervalSeconds - Durée de chaque bougie en secondes (ex: 5, 60, etc.)
 * @returns {Array<{ time: number, open: number, high: number, low: number, close: number }>}
 */
export function aggregateToCandles(points = [], intervalSeconds = 5) {
  if (!Array.isArray(points) || points.length === 0) {
    return [];
  }

  const interval = Math.max(1, Math.floor(intervalSeconds));
  const candles = [];
  let currentCandle = null;

  for (const pt of points) {
    if (!pt) continue;

    const rawT = pt.time ?? pt.t ?? 0;
    const sec = toSeconds(rawT);
    const bucketTime = Math.floor(sec / interval) * interval;

    // Détection si le point est déjà une bougie OHLC
    const hasOhlc =
      Number.isFinite(pt.open) &&
      Number.isFinite(pt.high) &&
      Number.isFinite(pt.low) &&
      Number.isFinite(pt.close);

    const price = Number(pt.price ?? (hasOhlc ? pt.close : 0));
    const open = hasOhlc ? Number(pt.open) : price;
    const high = hasOhlc ? Number(pt.high) : price;
    const low = hasOhlc ? Number(pt.low) : price;
    const close = hasOhlc ? Number(pt.close) : price;

    if (!Number.isFinite(price) && !hasOhlc) continue;

    if (!currentCandle || bucketTime > currentCandle.time) {
      currentCandle = {
        time: bucketTime,
        open,
        high,
        low,
        close,
      };
      candles.push(currentCandle);
    } else if (bucketTime === currentCandle.time) {
      currentCandle.high = Math.max(currentCandle.high, high);
      currentCandle.low = Math.min(currentCandle.low, low);
      currentCandle.close = close;
    }
  }

  return candles;
}

/**
 * Met à jour dynamiquement la série de chandeliers avec un nouveau tick en direct.
 * Si le tick tombe dans le même intervalle que la dernière bougie, celle-ci est mise à jour (high/low/close).
 * Sinon, une nouvelle bougie est créée.
 *
 * @param {Array<Object>} existingCandles
 * @param {{ t: number|string, price: number }} tick
 * @param {number} intervalSeconds
 * @returns {Array<Object>} Nouvelle liste de chandeliers
 */
export function updateCandlesWithTick(existingCandles = [], tick, intervalSeconds = 5) {
  if (!tick || !Number.isFinite(tick.price)) return existingCandles;

  const interval = Math.max(1, Math.floor(intervalSeconds));
  const sec = toSeconds(tick.t);
  const bucketTime = Math.floor(sec / interval) * interval;
  const price = Number(tick.price);

  if (!existingCandles || existingCandles.length === 0) {
    return [{
      time: bucketTime,
      open: price,
      high: price,
      low: price,
      close: price,
    }];
  }

  const lastCandle = existingCandles[existingCandles.length - 1];

  if (bucketTime === lastCandle.time) {
    const updated = {
      ...lastCandle,
      high: Math.max(lastCandle.high, price),
      low: Math.min(lastCandle.low, price),
      close: price,
    };
    return [...existingCandles.slice(0, -1), updated];
  }

  if (bucketTime > lastCandle.time) {
    const newCandle = {
      time: bucketTime,
      open: price,
      high: price,
      low: price,
      close: price,
    };
    return [...existingCandles, newCandle];
  }

  return existingCandles;
}
