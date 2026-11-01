import { Injectable } from '@nestjs/common';

/**
 * Nombre de séances de cotation retenu pour annualiser les indicateurs.
 * Les snapshots sont quotidiens mais un portefeuille ne cote pas les
 * week-ends : c'est la convention standard (252 jours ouvrés par an).
 */
export const TRADING_DAYS_PER_YEAR = 252;

/**
 * Indicateurs de performance et de risque d'une série de valeurs.
 *
 * Le service ne lit ni la base ni le réseau : chaque méthode prend un tableau
 * de nombres et renvoie un nombre. C'est ce qui les rend vérifiables à la main
 * (voir `performance-metrics.service.spec.ts`).
 *
 * Conventions retenues :
 *   - un rendement s'exprime en fraction (0.01 = +1 %) ;
 *   - le drawdown et la VaR sont renvoyés en **valeur positive** (une perte) ;
 *   - les séries trop courtes renvoient 0 plutôt que `NaN`.
 */
@Injectable()
export class PerformanceMetricsService {
  /**
   * Rendements d'une période à l'autre : `returns[i] = values[i+1] / values[i] - 1`.
   * Une valeur précédente nulle ou négative donne un rendement de 0 (cas d'un
   * portefeuille à découvert sur une ligne), pour ne pas propager `Infinity`.
   */
  computeDailyReturns(values: number[]): number[] {
    const returns: number[] = [];
    for (let i = 1; i < values.length; i += 1) {
      const previous = values[i - 1];
      returns.push(previous > 0 ? values[i] / previous - 1 : 0);
    }
    return returns;
  }

  /**
   * Écart-type des rendements, annualisé par défaut (× √252).
   * Utilise l'estimateur d'échantillon (division par n-1). Une série constante
   * — ou de moins de deux rendements — donne une volatilité nulle.
   */
  computeVolatility(returns: number[], annualize = true): number {
    if (returns.length < 2) return 0;
    const mean = this.mean(returns);
    const variance =
      returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
    const daily = Math.sqrt(variance);
    return annualize ? daily * Math.sqrt(TRADING_DAYS_PER_YEAR) : daily;
  }

  /**
   * Pire baisse depuis un plus haut, en fraction positive.
   * `[100, 120, 90, 130]` → `0.25` (de 120 à 90).
   */
  computeMaxDrawdown(values: number[]): number {
    let peak = Number.NEGATIVE_INFINITY;
    let maxDrawdown = 0;
    for (const value of values) {
      if (value > peak) peak = value;
      if (peak <= 0) continue;
      const drawdown = (peak - value) / peak;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
    return maxDrawdown;
  }

  /**
   * VaR historique : perte au quantile bas des rendements passés, renvoyée en
   * valeur positive. À 95 % sur 10 rendements, c'est le pire des 10 — aucune
   * hypothèse de loi normale n'est faite (méthode dite « historique »).
   */
  computeVaR(returns: number[], confidence = 0.95): number {
    if (returns.length === 0) return 0;
    const sorted = [...returns].sort((a, b) => a - b);
    // Le epsilon compense l'arrondi binaire de `1 - confidence` : à 90 % sur
    // 10 rendements, `1 - 0.9` vaut 0.09999999999999998 et le rang retomberait
    // sur 0 au lieu de 1 sans cette marge.
    const position = Math.floor((1 - confidence) * sorted.length + 1e-9);
    const index = Math.min(Math.max(position, 0), sorted.length - 1);
    return -sorted[index];
  }

  /**
   * Ratio de Sharpe annualisé : (rendement excédentaire moyen / écart-type) × √252.
   * `riskFreeRate` est un taux **annualisé** ; il est ramené au pas journalier
   * avant d'être retranché aux rendements. Sans dispersion, le ratio vaut 0
   * (un dénominateur nul produirait `Infinity`).
   */
  computeSharpeRatio(returns: number[], riskFreeRate = 0): number {
    if (returns.length < 2) return 0;
    const dailyRiskFreeRate = riskFreeRate / TRADING_DAYS_PER_YEAR;
    const excess = returns.map((value) => value - dailyRiskFreeRate);
    const mean = this.mean(excess);
    const variance =
      excess.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (excess.length - 1);
    const deviation = Math.sqrt(variance);
    if (deviation === 0) return 0;
    return (mean / deviation) * Math.sqrt(TRADING_DAYS_PER_YEAR);
  }

  private mean(values: number[]): number {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }
}
