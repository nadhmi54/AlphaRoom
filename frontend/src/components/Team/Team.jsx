import { TEAM_MEMBERS, TEAM_STATS } from '../../data/team.js';
import './Team.css';

export default function Team() {
  return (
    <section id="team" className="ar-team">
      <div className="ar-team__orb ar-team__orb--a" aria-hidden="true" />
      <div className="ar-team__orb ar-team__orb--b" aria-hidden="true" />

      <div className="ar-team__inner">
        <header className="ar-team__head">
          <span className="ar-team__pill">
            <span className="ar-team__pill-dot" />
            L&apos;équipe
          </span>
          <h2 className="ar-team__title">
            Six ingénieurs.
            <br />
            <span className="ar-team__title--accent">Une seule salle de marché.</span>
          </h2>
          <p className="ar-team__lead">
            Étudiants en dernière année à ESPRIT, nous avons construit ce simulateur ensemble :
            chacun porte un module, tous visent la même exigence de qualité.
          </p>

          <ul className="ar-team__stats">
            {TEAM_STATS.map((stat) => (
              <li key={stat.label} className="ar-team__stat">
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </li>
            ))}
          </ul>
        </header>

        <ul className="ar-team__grid">
          {TEAM_MEMBERS.map((member, index) => (
            <li
              key={member.id}
              className="ar-member"
              style={{ '--member-accent': member.accent }}
            >
              <img
                className="ar-member__photo"
                src={member.image}
                alt={`Portrait de ${member.name}`}
                width="640"
                height="800"
                loading="lazy"
              />
              <span className="ar-member__index" aria-hidden="true">
                0{index + 1}
              </span>
              <div className="ar-member__info">
                <h3 className="ar-member__name">{member.name}</h3>
                <ul className="ar-member__roles">
                  {member.roles.map((role) => (
                    <li key={role} className="ar-member__role">
                      {role}
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
