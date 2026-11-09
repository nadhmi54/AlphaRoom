import AcademyShell from '../components/AcademyShell.jsx';
import AcademyState from '../components/AcademyState.jsx';
import LevelJourney from '../components/LevelJourney.jsx';
import NextUnlock from '../components/NextUnlock.jsx';
import SkillProgressList from '../components/SkillProgressList.jsx';
import { useAcademyCatalog, useAcademyPath, useAcademyProgress } from '../hooks/useAcademy.js';

// Page de progression : XP, niveau global, parcours par niveau (cours validés,
// badge, mission), avancement par compétence et bloc « prochain déblocage ».
export default function AcademyProgressPage() {
  const { data: progress, loading, error, reload } = useAcademyProgress();
  const { data: catalog } = useAcademyCatalog();
  const { data: path } = useAcademyPath();

  const levelPercent =
    progress && progress.nextLevelXp > 0
      ? Math.min(100, Math.round((progress.xp / progress.nextLevelXp) * 100))
      : 0;
  const nextLocked = (catalog ?? []).find((course) => !course.unlocked) ?? null;
  const levels = path?.levels ?? [];

  return (
    <AcademyShell>
      <AcademyState loading={loading} error={error} onRetry={reload}>
        {progress && (
          <>
            <section className="ar-ac-xp">
              <div className="ar-ac-xp__level">
                <strong>{progress.level}</strong>
                <span>Niveau</span>
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div
                  className="ar-ac-bar"
                  role="progressbar"
                  aria-valuenow={levelPercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Progression vers le niveau suivant"
                >
                  <div className="ar-ac-bar__fill" style={{ width: `${levelPercent}%` }} />
                </div>
                <p className="ar-ac-muted" style={{ marginTop: 8 }}>
                  {progress.xp} XP · encore {progress.xpToNextLevel} XP pour le niveau{' '}
                  {progress.level + 1}
                </p>
              </div>
              <div className="ar-ac-xp__level">
                <strong>{progress.percentCompleted} %</strong>
                <span>
                  Leçons ({progress.completedLessons}/{progress.totalLessons})
                </span>
              </div>
            </section>

            {levels.length > 0 && (
              <section className="ar-ac__section">
                <div className="ar-ac__section-head">
                  <h2>Parcours par niveau</h2>
                  <p>
                    Valide tous les cours d’un niveau pour obtenir son badge, puis réussis sa
                    mission pour ouvrir le niveau suivant.
                  </p>
                </div>
                <LevelJourney levels={levels} />
              </section>
            )}

            <section className="ar-ac__section">
              <div className="ar-ac__section-head">
                <h2>Progression par compétence</h2>
              </div>
              <SkillProgressList skills={progress.skills ?? []} />
            </section>

            <section className="ar-ac__section">
              <NextUnlock course={nextLocked} />
            </section>
          </>
        )}
      </AcademyState>
    </AcademyShell>
  );
}
