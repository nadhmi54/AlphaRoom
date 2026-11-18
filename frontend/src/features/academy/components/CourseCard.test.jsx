// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import CourseCard from './CourseCard.jsx';

const renderCard = (course) =>
  render(
    <MemoryRouter>
      <CourseCard course={course} />
    </MemoryRouter>,
  );

describe('CourseCard', () => {
  it('affiche un cours verrouillé avec sa condition, sans lien d’ouverture', () => {
    renderCard({
      id: 'course-locked',
      title: 'Options avancées',
      level: 3,
      summary: 'Stratégies sur options.',
      isPremium: true,
      unlocked: false,
      unlockHint: 'Réussis le niveau 2.',
    });

    expect(screen.getByText('Options avancées')).toBeInTheDocument();
    expect(screen.getByText('Verrouillé')).toBeInTheDocument();
    expect(screen.getByText(/Réussis le niveau 2/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Ouvrir le cours/i })).not.toBeInTheDocument();
  });

  it('affiche un cours débloqué avec un lien vers le cours', () => {
    renderCard({
      id: 'course-open',
      title: 'Bases du marché',
      level: 1,
      summary: 'Les fondamentaux.',
      isPremium: false,
      unlocked: true,
      unlockHint: null,
    });

    const link = screen.getByRole('link', { name: /Ouvrir le cours/i });
    expect(link).toHaveAttribute('href', '/academy/cours/course-open');
    expect(screen.queryByText('Verrouillé')).not.toBeInTheDocument();
  });
});
