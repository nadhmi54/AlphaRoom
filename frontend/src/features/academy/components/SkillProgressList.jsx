/**
 * Progression par compétence : une compétence correspond à un cours. On montre
 * l'avancement en leçons terminées et le pourcentage, ainsi que l'état de
 * déblocage du cours.
 */
export default function SkillProgressList({ skills }) {
  if (!skills.length) {
    return <p className="ar-ac-muted">Aucune compétence à suivre pour l’instant.</p>;
  }

  return (
    <div className="ar-ac__grid">
      {skills.map((skill) => (
        <section key={skill.courseId} className="ar-ac-skill">
          <div className="ar-ac-skill__head">
            <h3>{skill.title}</h3>
            <span>{skill.percent} %</span>
          </div>
          <div
            className="ar-ac-bar"
            role="progressbar"
            aria-valuenow={skill.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Avancement sur ${skill.title}`}
          >
            <div className="ar-ac-bar__fill" style={{ width: `${skill.percent}%` }} />
          </div>
          <p className="ar-ac-muted">
            Niveau {skill.level} · {skill.completedLessons}/{skill.totalLessons} leçons
            {skill.unlocked ? '' : ' · cours verrouillé'}
          </p>
        </section>
      ))}
    </div>
  );
}
