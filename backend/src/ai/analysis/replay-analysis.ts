import type { SessionData } from '../contract/session-data.js';
import { computeMetrics, type ParticipantMetrics } from '../metrics/metrics.js';
import { scoreParticipant } from '../rubric/rubric.js';
import { formatNumber } from '../rubric/rubric.js';
import { pct, signedPct } from './format.js';

/**
 * Replay Analyzer : compare deux passages d'une même séance (avant / après un
 * rollback). Le but est pédagogique : voir ce que chaque étudiant a changé
 * quand on lui a redonné la même situation. Tout est calculé par le code.
 */

export interface RunSnapshot {
  run: number;
  pnl: number;
  returnRate: number;
  maxExposure: number;
  maxDrawdown: number;
  /** null : aucune position à protéger. */
  stopLossRatio: number | null;
  /** Moyenne des délais de réaction aux événements (minutes) ; null si aucune réaction. */
  reactionMeanMinutes: number | null;
  tradeCount: number;
  /** Note globale du barème (sur 4) ; null si rien n'est évaluable. */
  overallScore: number | null;
}

export interface ParticipantReplay {
  participantId: string;
  displayName: string;
  alias: string;
  before: RunSnapshot;
  after: RunSnapshot;
  deltas: {
    pnl: number;
    returnRate: number;
    maxExposure: number;
    maxDrawdown: number;
    overallScore: number | null;
  };
  /** Constats chiffrés (code) : ce qui a changé entre les deux passages. */
  changes: string[];
  verdict: 'improved' | 'unchanged' | 'worsened' | 'not_comparable';
}

export interface ReplayAnalysis {
  sessionId: string;
  fromRun: number;
  toRun: number;
  participants: ParticipantReplay[];
  /** Participants présents dans un seul des deux passages. */
  notComparable: number;
  summary: {
    improved: number;
    unchanged: number;
    worsened: number;
    meanScoreBefore: number | null;
    meanScoreAfter: number | null;
  };
  headline: string;
}

const reactionMean = (metrics: ParticipantMetrics): number | null => {
  const reacted = metrics.reactionDelays.value.filter((d) => d.minutes !== null);
  if (reacted.length === 0) return null;
  return reacted.reduce((s, d) => s + (d.minutes as number), 0) / reacted.length;
};

const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
const r2 = (n: number) => Math.round(n * 100) / 100;

function snapshot(session: SessionData, participantId: string): RunSnapshot {
  const metrics = computeMetrics(session, participantId);
  const { overall } = scoreParticipant(metrics);
  const mean = reactionMean(metrics);
  return {
    run: session.run,
    pnl: metrics.pnl.value,
    returnRate: metrics.returnRate.value,
    maxExposure: metrics.maxExposure.value,
    maxDrawdown: metrics.maxDrawdown.value,
    stopLossRatio: metrics.stopLossRatio.value,
    reactionMeanMinutes: mean === null ? null : r2(mean),
    tradeCount: metrics.tradeCount,
    overallScore: overall.score,
  };
}

export function compareRuns(before: SessionData, after: SessionData): ReplayAnalysis {
  const ids = [...new Set([...before.participants, ...after.participants].map((p) => p.id))].sort();
  const aliasOf = (id: string) => `etu_${String(ids.indexOf(id) + 1).padStart(2, '0')}`;
  const names = new Map([...before.participants, ...after.participants].map((p) => [p.id, p.displayName]));

  const participants: ParticipantReplay[] = [];
  let notComparable = 0;
  for (const id of ids) {
    const inBefore = before.participants.some((p) => p.id === id);
    const inAfter = after.participants.some((p) => p.id === id);
    if (!inBefore || !inAfter) {
      notComparable += 1;
      continue;
    }
    const b = snapshot(before, id);
    const a = snapshot(after, id);
    const deltas = {
      pnl: r2(a.pnl - b.pnl),
      returnRate: r4(a.returnRate - b.returnRate),
      maxExposure: r4(a.maxExposure - b.maxExposure),
      maxDrawdown: r4(a.maxDrawdown - b.maxDrawdown),
      overallScore: a.overallScore !== null && b.overallScore !== null ? r2(a.overallScore - b.overallScore) : null,
    };
    participants.push({
      participantId: id,
      displayName: names.get(id) ?? aliasOf(id),
      alias: aliasOf(id),
      before: b,
      after: a,
      deltas,
      changes: describeChanges(b, a, deltas),
      verdict: verdictOf(deltas.overallScore, b.tradeCount + a.tradeCount),
    });
  }

  const summary = {
    improved: participants.filter((p) => p.verdict === 'improved').length,
    unchanged: participants.filter((p) => p.verdict === 'unchanged').length,
    worsened: participants.filter((p) => p.verdict === 'worsened').length,
    meanScoreBefore: mean(participants.map((p) => p.before.overallScore)),
    meanScoreAfter: mean(participants.map((p) => p.after.overallScore)),
  };
  return {
    sessionId: after.sessionId,
    fromRun: before.run,
    toRun: after.run,
    participants,
    notComparable,
    summary,
    headline: headline(summary, participants.length, before.run, after.run),
  };
}

function mean(values: Array<number | null>): number | null {
  const known = values.filter((v): v is number => v !== null);
  return known.length === 0 ? null : r2(known.reduce((s, v) => s + v, 0) / known.length);
}

function verdictOf(scoreDelta: number | null, trades: number): ParticipantReplay['verdict'] {
  if (scoreDelta === null) return trades === 0 ? 'unchanged' : 'not_comparable';
  if (scoreDelta > 0.05) return 'improved';
  if (scoreDelta < -0.05) return 'worsened';
  return 'unchanged';
}

function describeChanges(b: RunSnapshot, a: RunSnapshot, d: ParticipantReplay['deltas']): string[] {
  const out: string[] = [];
  if (Math.abs(d.maxExposure) >= 0.02) {
    out.push(`Exposition maximale : ${pct(b.maxExposure)} → ${pct(a.maxExposure)} du capital.`);
  }
  if (Math.abs(d.maxDrawdown) >= 0.005) {
    out.push(`Plus forte baisse : ${signedPct(b.maxDrawdown)} → ${signedPct(a.maxDrawdown)}.`);
  }
  if (b.stopLossRatio !== a.stopLossRatio) {
    const label = (v: number | null) => (v === null ? 'aucune position' : `${pct(v)} des positions`);
    out.push(`Positions avec stop-loss : ${label(b.stopLossRatio)} → ${label(a.stopLossRatio)}.`);
  }
  if (b.reactionMeanMinutes !== a.reactionMeanMinutes) {
    const label = (v: number | null) => (v === null ? 'aucune réaction' : `${formatNumber(v)} min`);
    out.push(`Délai de réaction moyen : ${label(b.reactionMeanMinutes)} → ${label(a.reactionMeanMinutes)}.`);
  }
  if (Math.abs(d.pnl) >= 1) {
    out.push(`Résultat : ${signedPct(b.returnRate)} → ${signedPct(a.returnRate)} du capital.`);
  }
  if (d.overallScore !== null && d.overallScore !== 0) {
    out.push(`Note du barème : ${formatNumber(b.overallScore as number, 2)} → ${formatNumber(a.overallScore as number, 2)} sur 4.`);
  }
  if (out.length === 0) out.push('Comportement identique entre les deux passages.');
  return out;
}

function headline(s: ReplayAnalysis['summary'], total: number, from: number, to: number): string {
  if (total === 0) return `Aucun participant comparable entre le passage ${from} et le passage ${to}.`;
  const score =
    s.meanScoreBefore !== null && s.meanScoreAfter !== null
      ? ` Note moyenne : ${formatNumber(s.meanScoreBefore, 2)} → ${formatNumber(s.meanScoreAfter, 2)} sur 4.`
      : '';
  return `Passage ${from} → passage ${to} : ${s.improved} amélioré${s.improved > 1 ? 's' : ''}, ${s.unchanged} inchangé${s.unchanged > 1 ? 's' : ''}, ${s.worsened} en baisse sur ${total}.${score}`;
}
