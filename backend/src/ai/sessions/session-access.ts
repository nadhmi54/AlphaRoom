import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { Profile } from '../../users/profile.entity.js';
import { UserRole } from '../../users/user-role.enum.js';
import {
  SessionNotFoundError,
  SessionSourceUnavailableError,
  type SessionDataProvider,
} from '../contract/session-data-provider.js';
import type { SessionData } from '../contract/session-data.js';

export const isTeacher = (profile: Pick<Profile, 'role'>) =>
  profile.role === UserRole.GAME_MASTER || profile.role === UserRole.ADMIN;

/** Charge une séance et traduit les erreurs du fournisseur en réponses HTTP claires. */
export async function loadSession(provider: SessionDataProvider, sessionId: string, run: number): Promise<SessionData> {
  try {
    return await provider.getSession(sessionId, run);
  } catch (error) {
    if (error instanceof SessionNotFoundError) throw new NotFoundException(error.message);
    if (error instanceof SessionSourceUnavailableError) throw new ServiceUnavailableException(error.message);
    throw error;
  }
}

/** Séance telle que l'interface la voit : sans identifiants de participants. */
export interface PublicSession {
  sessionId: string;
  title: string;
  runs: number[];
  latestRun: number;
  durationMinutes: number;
  symbols: string[];
  participantCount: number;
  /** Vrai si la personne connectée participe à la séance. */
  joined: boolean;
}

/**
 * Séances visibles : un enseignant les voit toutes, un étudiant seulement
 * celles auxquelles il participe. Sans `listSessions`, la liste est vide
 * (l'enseignant saisit alors l'identifiant de la séance à la main).
 */
export async function listVisibleSessions(provider: SessionDataProvider, profile: Profile): Promise<PublicSession[]> {
  if (!provider.listSessions) return [];
  let summaries;
  try {
    summaries = await provider.listSessions();
  } catch (error) {
    if (error instanceof SessionSourceUnavailableError) throw new ServiceUnavailableException(error.message);
    throw error;
  }
  const teacher = isTeacher(profile);
  return summaries
    .map((s) => ({
      sessionId: s.sessionId,
      title: s.title,
      runs: s.runs,
      latestRun: s.runs.at(-1) ?? 1,
      durationMinutes: s.durationMinutes,
      symbols: s.symbols,
      participantCount: s.participantIds.length,
      joined: s.participantIds.includes(profile.id),
    }))
    .filter((s) => teacher || s.joined);
}
