// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import GrAssetPicker from './GrAssetPicker.jsx';

const chip = (name) => screen.getByRole('button', { name });

describe('GrAssetPicker', () => {
  it('ouvre le marché du premier actif sélectionné', () => {
    render(<GrAssetPicker assets={['XAU/USD']} onToggle={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Matières premières/i })).toHaveAttribute('aria-pressed', 'true');
    expect(chip(/XAU\/USD Or/i)).toBeInTheDocument();
    // Les actifs des autres marchés ne sont pas affichés.
    expect(screen.queryByRole('button', { name: /AAPL Apple/i })).not.toBeInTheDocument();
  });

  it('change de marché et vide la recherche précédente', () => {
    render(<GrAssetPicker assets={['XAU/USD']} onToggle={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Rechercher un actif/i), { target: { value: 'or' } });
    fireEvent.click(screen.getByRole('button', { name: /Actions/i }));

    expect(screen.getByLabelText(/Rechercher un actif/i)).toHaveValue('');
    expect(chip(/AAPL Apple/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /XAU\/USD Or/i })).not.toBeInTheDocument();
  });

  it('cherche sans tenir compte des accents ni de la casse', () => {
    render(<GrAssetPicker assets={['BTC/USD']} onToggle={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Matières premières/i }));
    fireEvent.change(screen.getByLabelText(/Rechercher un actif/i), { target: { value: 'PETROLE' } });

    expect(chip(/WTI\/USD/i)).toBeInTheDocument();
    expect(chip(/BRENT\/USD/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /XAU\/USD Or/i })).not.toBeInTheDocument();
  });

  it('signale une recherche sans résultat', () => {
    render(<GrAssetPicker assets={['BTC/USD']} onToggle={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Rechercher un actif/i), { target: { value: 'doge' } });

    expect(screen.getByText(/Aucun actif trouvé pour « doge »/i)).toBeInTheDocument();
  });

  it('appelle onToggle pour ajouter puis retirer un actif', () => {
    const onToggle = vi.fn();
    render(<GrAssetPicker assets={['XAU/USD']} onToggle={onToggle} />);

    fireEvent.click(screen.getByRole('button', { name: /Crypto/i }));
    fireEvent.click(chip(/ETH\/USDT Ethereum/i));
    expect(onToggle).toHaveBeenLastCalledWith('ETH/USDT');

    fireEvent.click(screen.getByRole('button', { name: /Retirer XAU\/USD/i }));
    expect(onToggle).toHaveBeenLastCalledWith('XAU/USD');
  });

  it('compte les actifs sélectionnés par marché', () => {
    render(<GrAssetPicker assets={['XAU/USD', 'WTI/USD', 'BTC/USD']} onToggle={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Matières premières/i })).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: /Crypto/i })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /Actions/i })).not.toHaveTextContent(/\d/);
  });
});
