import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ReportView from './ReportView.jsx';
import { sampleReport } from './testData.js';

describe('ReportView — « Pourquoi cette note ? »', () => {
  it('montre la note globale, la synthèse et la mention de critères non mesurés', () => {
    render(<ReportView report={sampleReport()} />);
    expect(screen.getByLabelText('Note globale 1,65 sur 4')).toBeInTheDocument();
    expect(screen.getByText(/Tu as pris une position très large/)).toBeInTheDocument();
    expect(screen.getByText(/2 critères évalués sur 3/)).toBeInTheDocument();
  });

  it('explique chaque critère : valeur mesurée, règle appliquée et preuves', () => {
    render(<ReportView report={sampleReport()} />);
    const risk = screen.getByText('Gestion du risque').closest('li');
    expect(within(risk).getByText('Mesuré : 91,8 %')).toBeInTheDocument();
    expect(within(risk).getByText(/au-delà de 80 %/)).toBeInTheDocument();
    expect(within(risk).getByText('minute 5')).toBeInTheDocument();
    expect(within(risk).getByRole('img', { name: '1 sur 4' })).toBeInTheDocument();
  });

  it('indique pourquoi un critère n’est pas évalué', () => {
    render(<ReportView report={sampleReport()} />);
    expect(screen.getByText(/Non évalué : aucune position fermée/)).toBeInTheDocument();
  });

  it('affiche la note corrigée par l’enseignant à côté du calcul automatique', () => {
    const report = sampleReport();
    report.content.criteria[0].teacherScore = 3;
    render(<ReportView report={report} />);
    expect(screen.getByText(/Note corrigée par ton enseignant \(calcul automatique : 1 \/ 4\)/)).toBeInTheDocument();
    expect(screen.getByText('3 / 4')).toBeInTheDocument();
  });

  it('liste les points forts, les pistes et les informations manquantes avec leurs preuves', () => {
    render(<ReportView report={sampleReport()} />);
    expect(screen.getByText('Tu as agi tôt dans la séance.')).toBeInTheDocument();
    expect(screen.getByText('exécution a1', { selector: 'li' })).toBeInTheDocument();
    expect(screen.getByText(/Pose un stop-loss/)).toBeInTheDocument();
    expect(screen.getByText(/Prix attendu non fourni/)).toBeInTheDocument();
  });

  it('ne montre ni trace technique ni identifiant à l’étudiant', () => {
    render(<ReportView report={sampleReport()} />);
    expect(screen.queryByText(/SHA-256|abc123|user-amine/)).not.toBeInTheDocument();
    expect(screen.getByText(/ton enseignant relit et valide/)).toBeInTheDocument();
  });
});
