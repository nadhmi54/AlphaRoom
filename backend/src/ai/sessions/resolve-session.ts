import { NotFoundException } from '@nestjs/common';
import type { Profile } from '../../users/profile.entity.js';
import { resolveAlias } from '../context/ai-context.js';
import type { SessionDataProvider } from '../contract/session-data-provider.js';
import type { SessionData } from '../contract/session-data.js';
import { isTeacher, listVisibleSessions, loadSession } from './session-access.js';

export interface SessionTarget {
  sessionId?: string;
  run?: number;
  /** Enseignant uniquement : agir « comme » un participant (alias etu_01…). */
  alias?: string;
}

/**
 * Trouve la séance, le passage et le participant concernés par une demande.
 * Sans identifiant : la première séance de la personne ; sans passage : le dernier.
 * Un étudiant ne peut viser que lui-même ; seul un enseignant peut utiliser un alias.
 */
export async function resolveSessionFor(
  sessions: SessionDataProvider,
  profile: Profile,
  target: SessionTarget,
): Promise<{ session: SessionData; participantId: string }> {
  let sessionId = target.sessionId;
  let run = target.run;
  if (!sessionId) {
    const visible = await listVisibleSessions(sessions, profile);
    const found = visible.find((s) => s.joined) ?? (isTeacher(profile) ? visible[0] : undefined);
    if (!found) throw new NotFoundException('Tu ne participes à aucune séance pour le moment.');
    sessionId = found.sessionId;
    run ??= found.latestRun;
  }
  if (run === undefined) {
    const visible = await listVisibleSessions(sessions, profile).catch(() => []);
    run = visible.find((s) => s.sessionId === sessionId)?.latestRun ?? 1;
  }
  const session = await loadSession(sessions, sessionId, run);

  if (target.alias) {
    if (!isTeacher(profile)) throw new NotFoundException('Tu ne participes pas à cette séance.');
    const participantId = resolveAlias(session, target.alias);
    if (!participantId) throw new NotFoundException('Participant introuvable dans la séance.');
    return { session, participantId };
  }
  return { session, participantId: profile.id };
}
