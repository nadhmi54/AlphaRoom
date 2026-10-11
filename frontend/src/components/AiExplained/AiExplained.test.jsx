import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AiExplained from './AiExplained.jsx';
import { AI_STEPS } from '../../data/aiExplained.js';

describe('AiExplained', () => {
  it('expose la section #how avec une étape par rubrique', () => {
    const { container } = render(<AiExplained />);
    expect(container.querySelector('#how')).not.toBeNull();
    AI_STEPS.forEach((step) => {
      expect(screen.getByRole('heading', { level: 3, name: step.title })).toBeInTheDocument();
    });
  });

  it("affiche l'exemple d'explication d'une recommandation", () => {
    render(<AiExplained />);
    expect(screen.getByText('Pourquoi cette recommandation ?')).toBeInTheDocument();
    expect(screen.getByText('Exemple illustratif')).toBeInTheDocument();
  });
});
