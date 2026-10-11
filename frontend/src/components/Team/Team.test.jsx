import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Team from './Team.jsx';
import { TEAM_MEMBERS } from '../../data/team.js';

describe('Team', () => {
  it('expose la section #team', () => {
    const { container } = render(<Team />);
    expect(container.querySelector('#team')).not.toBeNull();
  });

  it('affiche chaque membre avec son portrait', () => {
    render(<Team />);
    expect(TEAM_MEMBERS).toHaveLength(6);
    TEAM_MEMBERS.forEach((member) => {
      expect(screen.getByRole('heading', { level: 3, name: member.name })).toBeInTheDocument();
      expect(screen.getByAltText(`Portrait de ${member.name}`)).toBeInTheDocument();
    });
  });
});
