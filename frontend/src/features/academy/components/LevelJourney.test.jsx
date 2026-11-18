// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LevelJourney from './LevelJourney.jsx';

const levels = [
  {
    level: 1,
    open: true,
    coursesValidated: 1,
    coursesTotal: 2,
    courses: [
      { id: 'c1', code: 'A', title: 'Cours A', position: 0, validated: true },
      { id: 'c2', code: 'B', title: 'Cours B', position: 1, validated: false },
    ],
    badge: { code: 'DEBUTANT', title: 'Débutant', icon: 'niveau', awarded: false },
    mission: {
      id: 'm1',
      code: 'M1',
      title: 'Prendre 3 ordres',
      description: null,
      criteria: {},
      state: 'locked',
      unlockCondition: 'Valide tous les cours du niveau 1 pour débloquer cette mission.',
    },
  },
  {
    level: 2,
    open: false,
    coursesValidated: 1,
    coursesTotal: 1,
    courses: [],
    badge: null,
    mission: {
      id: 'm2',
      code: 'M2',
      title: 'Maîtriser le drawdown',
      description: null,
      criteria: {},
      state: 'passed',
      unlockCondition: 'Mission réussie : le niveau suivant est ouvert.',
    },
  },
];

describe('LevelJourney', () => {
  it('affiche l’avancement en cours validés de chaque niveau', () => {
    render(<LevelJourney levels={levels} />);

    expect(screen.getByText('Niveau 1')).toBeInTheDocument();
    expect(screen.getByText('1/2 cours validés')).toBeInTheDocument();
    expect(screen.getByText('Niveau 2')).toBeInTheDocument();
    expect(screen.getByText('1/1 cours validé')).toBeInTheDocument();
  });

  it('traduit la clé d’icône du badge en emoji (jamais de texte brut)', () => {
    render(<LevelJourney levels={levels} />);

    expect(screen.getByText('🎓')).toBeInTheDocument();
    expect(screen.queryByText('niveau')).not.toBeInTheDocument();
    expect(screen.getByText(/Débutant — à débloquer/)).toBeInTheDocument();
  });

  it('affiche la condition d’une mission verrouillée', () => {
    render(<LevelJourney levels={levels} />);

    expect(screen.getByText('Verrouillée')).toBeInTheDocument();
    expect(
      screen.getByText('Valide tous les cours du niveau 1 pour débloquer cette mission.'),
    ).toBeInTheDocument();
  });

  it('annonce le déblocage du niveau suivant après une mission réussie', () => {
    render(<LevelJourney levels={levels} />);

    expect(screen.getByText('Réussie')).toBeInTheDocument();
    expect(screen.getByText('Niveau suivant débloqué')).toBeInTheDocument();
  });

  it('affiche un état vide quand aucun niveau n’est fourni', () => {
    render(<LevelJourney levels={[]} />);

    expect(screen.getByText(/Aucun niveau à afficher/)).toBeInTheDocument();
  });
});
