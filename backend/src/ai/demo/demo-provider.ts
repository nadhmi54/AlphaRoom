import type { SessionData } from '../contract/session-data.js';
import { InMemorySessionDataProvider } from '../contract/session-data-provider.js';
import { buildPanicTuesday } from '../fixtures/panic-tuesday.js';

/** Participant de la démo que l'on peut rattacher à un vrai compte pour tester côté étudiant. */
export const DEMO_STUDENT_FIXTURE_ID = 'user-amine';

/** Remplace un identifiant de participant par un autre, partout dans la séance. */
export function remapParticipant(session: SessionData, from: string, to: string): SessionData {
  return {
    ...session,
    participants: session.participants.map((p) => (p.id === from ? { ...p, id: to } : p)),
  };
}

/**
 * Séance fictive « mardi de la panique », deux passages (avant / après rollback).
 * `studentId` (facultatif) : identifiant d'un vrai compte trader (`AI_DEMO_STUDENT_ID`)
 * qui prend la place d'Amine, pour tester l'écran étudiant et le coach.
 */
export function createDemoProvider(studentId?: string): InMemorySessionDataProvider {
  const build = (run: number) => {
    const session = buildPanicTuesday(run);
    return studentId ? remapParticipant(session, DEMO_STUDENT_FIXTURE_ID, studentId) : session;
  };
  return new InMemorySessionDataProvider([build(1), build(2)]);
}
