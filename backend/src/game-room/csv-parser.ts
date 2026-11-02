import type { CsvCandle } from './game-room-config.js';

export interface CsvIssue {
  line: number;
  message: string;
}

export interface CsvParseResult {
  candles: CsvCandle[];
  issues: CsvIssue[];
  columns: string[];
  /** Durée couverte par les bougies valides, en secondes (null si < 2 bougies). */
  spanSeconds: number | null;
  startAt: string | null;
  endAt: string | null;
  minClose: number | null;
  maxClose: number | null;
}

const MAX_ROWS = 20_000;
const TIMESTAMP_HEADERS = ['timestamp', 'time', 'date', 'datetime', 't', 'horodatage', 'heure'];
const OPEN_HEADERS = ['open', 'o', 'ouverture'];
const HIGH_HEADERS = ['high', 'h', 'plus_haut', 'haut'];
const LOW_HEADERS = ['low', 'l', 'plus_bas', 'bas'];
const CLOSE_HEADERS = ['close', 'c', 'cloture', 'fermeture'];
const VOLUME_HEADERS = ['volume', 'v', 'vol'];

/**
 * Analyse un fichier CSV de bougies OHLC.
 *
 * Accepte les séparateurs `,` `;` et tabulation, une ligne d'en-tête facultative
 * (sinon l'ordre timestamp,open,high,low,close[,volume] est supposé) et des
 * horodatages ISO-8601 ou epoch (secondes/millisecondes). Les lignes invalides
 * sont signalées avec leur numéro pour que le Meneur de Jeu puisse corriger son
 * fichier avant de créer la salle.
 */
export function parseCandlesCsv(content: string): CsvParseResult {
  const issues: CsvIssue[] = [];
  const lines = (content ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  if (lines.length === 0) {
    return emptyResult(issues, 'Le fichier CSV est vide.');
  }
  if (lines.length > MAX_ROWS) {
    return emptyResult(issues, `Fichier trop volumineux : ${lines.length} lignes (maximum ${MAX_ROWS}).`);
  }

  const delimiter = detectDelimiter(lines[0]);
  const headerCells = splitLine(lines[0], delimiter).map((cell) => cell.toLowerCase());
  const hasHeader = headerCells.some((cell) =>
    [...TIMESTAMP_HEADERS, ...CLOSE_HEADERS, ...OPEN_HEADERS].includes(cell),
  );

  let columns: string[];
  let dataLines: Array<{ line: string; number: number }>;
  if (hasHeader) {
    columns = headerCells;
    dataLines = lines.slice(1).map((line, index) => ({ line, number: index + 2 }));
  } else {
    columns = ['timestamp', 'open', 'high', 'low', 'close', 'volume'];
    dataLines = lines.map((line, index) => ({ line, number: index + 1 }));
  }

  const index = {
    timestamp: firstIndex(columns, TIMESTAMP_HEADERS, 0),
    open: firstIndex(columns, OPEN_HEADERS, 1),
    high: firstIndex(columns, HIGH_HEADERS, 2),
    low: firstIndex(columns, LOW_HEADERS, 3),
    close: firstIndex(columns, CLOSE_HEADERS, 4),
    volume: firstIndex(columns, VOLUME_HEADERS, 5),
  };

  const candles: CsvCandle[] = [];
  for (const { line, number } of dataLines) {
    const cells = splitLine(line, delimiter);
    const rawTimestamp = cells[index.timestamp];
    const timestamp = normalizeTimestamp(rawTimestamp);
    if (!timestamp) {
      issues.push({ line: number, message: `Horodatage illisible : « ${rawTimestamp ?? ''} ».` });
      continue;
    }

    const open = Number(cells[index.open]?.replace(',', '.'));
    const high = Number(cells[index.high]?.replace(',', '.'));
    const low = Number(cells[index.low]?.replace(',', '.'));
    const close = Number(cells[index.close]?.replace(',', '.'));
    const volumeRaw = cells[index.volume];
    const volume = volumeRaw === undefined || volumeRaw === '' ? undefined : Number(volumeRaw.replace(',', '.'));

    if (![open, high, low, close].every((value) => Number.isFinite(value) && value > 0)) {
      issues.push({ line: number, message: 'Prix OHLC invalides (valeurs numériques strictement positives attendues).' });
      continue;
    }
    if (high < low) {
      issues.push({ line: number, message: `Cours incohérent : high (${high}) < low (${low}).` });
      continue;
    }

    candles.push({ timestamp, open, high, low, close, ...(volume !== undefined && Number.isFinite(volume) ? { volume } : {}) });
  }

  candles.sort((a, b) => toEpochSeconds(a.timestamp) - toEpochSeconds(b.timestamp));

  const duplicates = new Set<string>();
  const deduped = candles.filter((candle) => {
    if (duplicates.has(candle.timestamp)) return false;
    duplicates.add(candle.timestamp);
    return true;
  });
  if (deduped.length !== candles.length) {
    issues.push({ line: 0, message: `${candles.length - deduped.length} horodatage(s) en double ignoré(s).` });
  }

  if (deduped.length < 2) {
    issues.push({ line: 0, message: 'Au moins deux bougies valides sont nécessaires pour rejouer un historique.' });
  }

  const closes = deduped.map((candle) => candle.close);
  const spanSeconds =
    deduped.length >= 2
      ? Math.max(1, toEpochSeconds(deduped[deduped.length - 1].timestamp) - toEpochSeconds(deduped[0].timestamp))
      : null;

  return {
    candles: deduped,
    issues,
    columns: columns.slice(0, 6),
    spanSeconds,
    startAt: deduped[0]?.timestamp ?? null,
    endAt: deduped.at(-1)?.timestamp ?? null,
    minClose: closes.length ? Math.min(...closes) : null,
    maxClose: closes.length ? Math.max(...closes) : null,
  };
}

function emptyResult(issues: CsvIssue[], message: string): CsvParseResult {
  issues.push({ line: 0, message });
  return {
    candles: [],
    issues,
    columns: [],
    spanSeconds: null,
    startAt: null,
    endAt: null,
    minClose: null,
    maxClose: null,
  };
}

function detectDelimiter(line: string): string {
  const candidates = [',', ';', '\t'];
  let best = ',';
  let bestCount = 0;
  for (const candidate of candidates) {
    const count = line.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function firstIndex(columns: string[], aliases: string[], fallback: number): number {
  const found = columns.findIndex((column) => aliases.includes(column));
  return found >= 0 ? found : Math.min(fallback, Math.max(0, columns.length - 1));
}

function normalizeTimestamp(raw?: string): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (/^\d+$/.test(value)) {
    const numeric = Number(value);
    const millis = numeric > 1e11 ? numeric : numeric * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const date = new Date(value.includes('T') || value.includes('-') ? value : value.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toEpochSeconds(timestamp: string): number {
  return Math.round(new Date(timestamp).getTime() / 1000);
}
