import { useEffect, useRef, useState } from 'react';

/**
 * Détecte les cours qui viennent d'être débloqués en comparant les verrous du
 * chargement précédent et ceux du chargement courant. Aucune notification au
 * premier chargement (on ne connaît pas encore d'état antérieur : un cours déjà
 * débloqué à l'ouverture n'a pas été « débloqué à l'instant »).
 */
export function useNewlyUnlocked(courses) {
  const previousLockedIds = useRef(null);
  const [newlyUnlocked, setNewlyUnlocked] = useState([]);

  useEffect(() => {
    if (!courses) return;

    const lockedIds = new Set(
      courses.filter((course) => !course.unlocked).map((course) => course.id),
    );

    const previous = previousLockedIds.current;
    if (previous) {
      const justUnlocked = courses.filter(
        (course) => course.unlocked && previous.has(course.id),
      );
      if (justUnlocked.length) {
        setNewlyUnlocked((list) => {
          const known = new Set(list.map((course) => course.id));
          return [...list, ...justUnlocked.filter((course) => !known.has(course.id))];
        });
      }
    }

    previousLockedIds.current = lockedIds;
  }, [courses]);

  const dismiss = (courseId) =>
    setNewlyUnlocked((list) => list.filter((course) => course.id !== courseId));

  return { newlyUnlocked, dismiss };
}
