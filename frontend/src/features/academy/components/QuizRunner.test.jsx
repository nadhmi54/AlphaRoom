// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import QuizRunner from './QuizRunner.jsx';

const quiz = {
  id: 'quiz-1',
  title: 'Quiz marché',
  passThreshold: 70,
  questions: [
    { id: 'q-1', position: 1, prompt: 'Qu’est-ce que le bid ?', options: ['Prix d’achat', 'Prix de vente'] },
    { id: 'q-2', position: 2, prompt: 'Un ordre Market…', options: ['est exécuté immédiatement', 'attend un prix'] },
  ],
};

const perfectResult = {
  quizId: 'quiz-1',
  score: 100,
  passed: true,
  correctCount: 2,
  totalQuestions: 2,
  threshold: 70,
  answers: [
    { questionId: 'q-1', selectedIndex: 0, correctIndex: 0, correct: true, explanation: null },
    { questionId: 'q-2', selectedIndex: 0, correctIndex: 0, correct: true, explanation: null },
  ],
};

describe('QuizRunner', () => {
  it('n’active la validation qu’une fois toutes les questions répondues', () => {
    render(<QuizRunner quiz={quiz} submit={vi.fn()} />);

    const validate = screen.getByRole('button', { name: /Valider/i });
    expect(validate).toBeDisabled();

    fireEvent.click(screen.getByLabelText('Prix d’achat'));
    expect(validate).toBeDisabled();

    fireEvent.click(screen.getByLabelText('est exécuté immédiatement'));
    expect(validate).not.toBeDisabled();
    expect(validate).toHaveTextContent('2/2');
  });

  it('envoie les choix au serveur et affiche la correction renvoyée', async () => {
    const submit = vi.fn().mockResolvedValue(perfectResult);
    render(<QuizRunner quiz={quiz} submit={submit} />);

    fireEvent.click(screen.getByLabelText('Prix d’achat'));
    fireEvent.click(screen.getByLabelText('est exécuté immédiatement'));
    fireEvent.click(screen.getByRole('button', { name: /Valider/i }));

    expect(await screen.findByText(/Quiz réussi/)).toBeInTheDocument();
    expect(screen.getByText('100 %')).toBeInTheDocument();
    expect(submit).toHaveBeenCalledWith([
      { questionId: 'q-1', selectedIndex: 0 },
      { questionId: 'q-2', selectedIndex: 0 },
    ]);
  });

  it('remonte l’erreur de soumission du serveur', async () => {
    const submit = vi.fn().mockRejectedValue(new Error('Question inconnue.'));
    render(<QuizRunner quiz={quiz} submit={submit} />);

    fireEvent.click(screen.getByLabelText('Prix d’achat'));
    fireEvent.click(screen.getByLabelText('est exécuté immédiatement'));
    fireEvent.click(screen.getByRole('button', { name: /Valider/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Question inconnue.');
  });

  it('permet de réessayer après une correction', async () => {
    const submit = vi.fn().mockResolvedValue(perfectResult);
    render(<QuizRunner quiz={quiz} submit={submit} />);

    fireEvent.click(screen.getByLabelText('Prix d’achat'));
    fireEvent.click(screen.getByLabelText('est exécuté immédiatement'));
    fireEvent.click(screen.getByRole('button', { name: /Valider/i }));

    expect(await screen.findByText(/Quiz réussi/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Recommencer/i }));

    // La copie est remise à zéro : aucun résultat affiché et validation désactivée.
    expect(screen.queryByText(/Quiz réussi/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Valider/i })).toBeDisabled();
  });
});
