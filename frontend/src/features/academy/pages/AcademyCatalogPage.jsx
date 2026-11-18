import AcademyShell from '../components/AcademyShell.jsx';
import AcademyState from '../components/AcademyState.jsx';
import CourseCard from '../components/CourseCard.jsx';
import NextUnlock from '../components/NextUnlock.jsx';
import UnlockNotice from '../components/UnlockNotice.jsx';
import { useAcademyCatalog } from '../hooks/useAcademy.js';
import { useNewlyUnlocked } from '../hooks/useNewlyUnlocked.js';

// Catalogue : tous les cours, verrouillés compris et visibles avec leur
// condition, plus le bloc « prochain déblocage » et, le cas échéant, la
// notification « Cours débloqué ».
export default function AcademyCatalogPage() {
  const { data, loading, error, reload } = useAcademyCatalog();
  const { newlyUnlocked, dismiss } = useNewlyUnlocked(data);

  const courses = data ?? [];
  const unlockedCount = courses.filter((course) => course.unlocked).length;
  const nextLocked = courses.find((course) => !course.unlocked) ?? null;

  return (
    <AcademyShell>
      <AcademyState
        loading={loading}
        error={error}
        onRetry={reload}
        empty={!courses.length}
        emptyText="Aucun cours n’est encore publié dans le catalogue."
      >
        <section className="ar-ac__section">
          <div className="ar-ac__section-head">
            <h2>Catalogue des cours</h2>
            <p>
              {unlockedCount} cours débloqué{unlockedCount > 1 ? 's' : ''} sur {courses.length}
            </p>
          </div>
          <div className="ar-ac__grid">
            {courses.map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        </section>

        <section className="ar-ac__section">
          <NextUnlock course={nextLocked} />
        </section>
      </AcademyState>

      <UnlockNotice
        course={newlyUnlocked[0] ?? null}
        onDismiss={() => dismiss(newlyUnlocked[0]?.id)}
      />
    </AcademyShell>
  );
}
