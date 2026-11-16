import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Markdown from './Markdown.jsx';

describe('Markdown', () => {
  it('met en forme gras, italique, code et listes', () => {
    const { container } = render(<Markdown text={'Voici **l’essentiel** et *un détail* avec `2650`.\n\n- premier point\n- second point\n\n1. étape un\n2. étape deux'} />);
    expect(container.querySelector('strong')).toHaveTextContent('l’essentiel');
    expect(container.querySelector('em')).toHaveTextContent('un détail');
    expect(container.querySelector('code')).toHaveTextContent('2650');
    expect(container.querySelectorAll('ul li')).toHaveLength(2);
    expect(container.querySelectorAll('ol li')).toHaveLength(2);
  });

  it('affiche un tableau', () => {
    const table = '| Scénario | Résultat |\n|---|---|\n| Baisse de 3 % | −1 608 $ |\n| Hausse de 3 % | +1 608 $ |';
    render(<Markdown text={table} />);
    expect(screen.getByRole('columnheader', { name: 'Scénario' })).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.getByRole('cell', { name: '−1 608 $' })).toBeInTheDocument();
  });

  it('n’exécute jamais de HTML venant du modèle', () => {
    const { container } = render(<Markdown text={'<img src=x onerror="alert(1)"> et <script>alert(2)</script>'} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container).toHaveTextContent('<script>alert(2)</script>');
  });

  it('un astérisque isolé ou un tiret dans une phrase ne casse rien', () => {
    const { container } = render(<Markdown text={'Un prix à 2 700 - 2 680 * 20 oz, ça va.'} />);
    expect(container).toHaveTextContent('Un prix à 2 700 - 2 680 * 20 oz, ça va.');
    expect(container.querySelector('ul')).toBeNull();
  });

  it('rend les titres en texte et les citations', () => {
    const { container } = render(<Markdown text={'## Mon avis\n\n> Rappel : c’est une simulation.'} />);
    expect(container.querySelector('.md__heading')).toHaveTextContent('Mon avis');
    expect(container.querySelector('blockquote')).toHaveTextContent('c’est une simulation');
  });
});
