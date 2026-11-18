import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../../services/apiClient.js';
import {
  getCatalog,
  getCourse,
  getCourseQuizzes,
  getMissions,
  getMyProgress,
  getPath,
  getQuiz,
  getMyBadges,
  listBadges,
} from '../api/academyApi.js';

const describeError = (error, fallback) => {
  if (error instanceof ApiError && error.status === 401) {
    return 'Connecte-toi pour accéder à l’Academy.';
  }
  return error?.message || fallback;
};

/**
 * Charge une ressource de l'Academy et suit chargement / erreur. Les réponses
 * périmées sont ignorées (même schéma que `usePerformance`) : changer de cours
 * pendant qu'une requête est en vol ne mélange jamais deux états.
 */
function useResource(loader, fallbackMessage) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const next = await loader();
      if (id !== requestId.current) return;
      setData(next);
      setError('');
    } catch (requestError) {
      if (id !== requestId.current) return;
      setError(describeError(requestError, fallbackMessage));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [loader, fallbackMessage]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(
    () => () => {
      requestId.current += 1;
    },
    [],
  );

  return { data, loading, error, reload: load };
}

/** Catalogue des cours (verrouillés inclus, avec leur condition). */
export function useAcademyCatalog() {
  return useResource(
    useCallback(() => getCatalog(), []),
    'Impossible de charger le catalogue de l’Academy.',
  );
}

/** Progression du joueur : XP, niveau, avancement par compétence. */
export function useAcademyProgress() {
  return useResource(
    useCallback(() => getMyProgress(), []),
    'Impossible de charger ta progression.',
  );
}

/** Parcours par niveau : niveaux ouverts/verrouillés, cours validés, missions. */
export function useAcademyPath() {
  return useResource(
    useCallback(() => getPath(), []),
    'Impossible de charger ton parcours.',
  );
}

/** Missions et défis. */
export function useAcademyMissions() {
  return useResource(
    useCallback(() => getMissions(), []),
    'Impossible de charger les missions.',
  );
}

/** Détail d'un cours ; ne tire rien tant que l'identifiant est absent. */
export function useCourse(courseId) {
  return useResource(
    useCallback(() => (courseId ? getCourse(courseId) : Promise.resolve(null)), [courseId]),
    'Impossible de charger ce cours.',
  );
}

/** Quiz d'un cours. */
export function useCourseQuizzes(courseId) {
  return useResource(
    useCallback(
      () => (courseId ? getCourseQuizzes(courseId) : Promise.resolve([])),
      [courseId],
    ),
    'Impossible de charger les quiz de ce cours.',
  );
}

/** Un quiz à passer (questions sans réponses). */
export function useQuiz(quizId) {
  return useResource(
    useCallback(() => (quizId ? getQuiz(quizId) : Promise.resolve(null)), [quizId]),
    'Impossible de charger ce quiz.',
  );
}

/** Catalogue des badges + badges obtenus par le joueur (chargés ensemble). */
export function useAcademyBadges() {
  const [catalog, setCatalog] = useState(null);
  const [mine, setMine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const [list, owned] = await Promise.all([listBadges(), getMyBadges()]);
      if (id !== requestId.current) return;
      setCatalog(list);
      setMine(owned);
      setError('');
    } catch (requestError) {
      if (id !== requestId.current) return;
      setError(describeError(requestError, 'Impossible de charger les badges.'));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(
    () => () => {
      requestId.current += 1;
    },
    [],
  );

  return { catalog, mine, loading, error, reload: load };
}
