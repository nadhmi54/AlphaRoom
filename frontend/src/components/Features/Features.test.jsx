import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import Features from './Features.jsx';
import { MODULES } from '../../data/modules.js';

describe('Features', () => {
  it('affiche une carte par module', () => {
    render(
      <MemoryRouter>
        <Features />
      </MemoryRouter>,
    );
    expect(MODULES).toHaveLength(6);
    MODULES.forEach((module) => {
      expect(screen.getByText(module.title)).toBeInTheDocument();
    });
  });

  it('expose la section #features pour la navigation', () => {
    const { container } = render(
      <MemoryRouter>
        <Features />
      </MemoryRouter>,
    );
    expect(container.querySelector('#features')).not.toBeNull();
  });
});
