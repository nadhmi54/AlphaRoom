import { Injectable } from '@nestjs/common';
import { GameRoomService } from './game-room.service.js';
import { SimulationEngineService } from './simulation-engine.service.js';

@Injectable()
export class GameRoomAiService {
  constructor(
    private readonly roomService: GameRoomService,
    private readonly simEngine: SimulationEngineService,
  ) {}

  /**
   * 1. AI Market Analyst : Analyse de l'état actuel du marché simulé.
   */
  async getMarketAnalysis(roomId: string, userId: string) {
    const details = await this.roomService.getRoomDetails(roomId, userId);
    const minute = details.room.currentMinute;
    const price = details.market.price;
    const spread = details.market.spread;
    const symbol = details.market.symbol;

    let sentiment = 'Neutre';
    let summary = '';
    let recommendations: string[] = [];

    if (minute < 10) {
      sentiment = 'Stable / Consolidation';
      summary = `Le cours de ${symbol} oscille calmement autour de ${price} avec un spread étroit de ${spread}. Phase idéale pour calibrer la taille de ses positions sans subir de slippage excessif.`;
      recommendations = [
        'Établir un plan de trading avant l’arrivée des annonces macroéconomiques.',
        'Fixer systématiquement un Stop-Loss adapté à votre capital (max 1-2% de risque par trade).',
      ];
    } else if (minute >= 10 && minute < 20) {
      sentiment = 'Baissier / Forte Volatilité';
      summary = `Suite au communiqué macroéconomique de la minute 11, le cours a chuté à ${price} $US. Le carnet montre un élargissement du spread (${spread} $US) et une pression vendeuse institutionnelle.`;
      recommendations = [
        'Éviter le « revenge trading » ou le moyennage à la baisse sans confirmation de support.',
        'Surveiller les rebonds techniques vers 2 696 $ pour déboucler les positions surexposées.',
      ];
    } else if (minute >= 20 && minute < 25) {
      sentiment = 'Panique / Choc de Liquidité';
      summary = `FLASH CRASH ! Débouclage massif en cours. Le cours s’est effondré vers ${price} $US. Le carnet d’ordres est asséché avec un spread atteignant ${spread} $US. Risque de slippage critique sur les ordres au marché.`;
      recommendations = [
        'Ne pas tenter d’attraper un couteau qui tombe : attendre une stabilisation claire des carnets.',
        'Si votre Stop-Loss n’a pas été déclenché, évaluez une clôture manuelle d’urgence pour protéger votre capital restant.',
      ];
    } else {
      sentiment = 'Rebond technique / Stabilisation';
      summary = `Le marché trouve un plancher technique et stabilise ses cotations autour de ${price} $US. Les acheteurs à bon compte réintègrent le carnet.`;
      recommendations = [
        'Analyser vos positions ouvertes et sécuriser les gains du rebond.',
        'Préparer le débriefing pédagogique avec le formateur.',
      ];
    }

    return {
      role: 'AI Market Analyst',
      currentMinute: minute,
      price,
      spread,
      sentiment,
      summary,
      recommendations,
    };
  }

  /**
   * 2. AI Trading Coach : Conseils individualisés et réponses aux questions.
   */
  async askTradingCoach(roomId: string, userId: string, question: string) {
    const student = await this.roomService.getStudentPortfolio(roomId, userId);
    const details = await this.roomService.getRoomDetails(roomId, userId);

    const cash = student.portfolio.cash;
    const totalValue = student.portfolio.totalValue;
    const returnPercent = student.portfolio.returnPercent;
    const positions = student.positions;
    const currentPrice = details.market.price;

    const lowerQ = (question || '').toLowerCase();
    const symbol = details.market.symbol;
    const initialCash = student.portfolio.initialCash;
    let answer = '';

    if (lowerQ.includes('perte') || lowerQ.includes('pourquoi') || lowerQ.includes('pnl')) {
      if (returnPercent < 0) {
        answer = `Votre portefeuille est en perte de ${Math.abs(returnPercent)}% (valeur actuelle : ${totalValue} contre ${initialCash} initiaux). Cela s'explique par votre exposition sur ${symbol} : vos achats ont été réalisés à un prix moyen supérieur au cours actuel de ${currentPrice}. Si vous n'avez pas posé de Stop-Loss lors de la baisse, la perte latente s'est creusée.`;
      } else {
        answer = `Votre portefeuille est actuellement positif avec un rendement de +${returnPercent}%. Vos prises de positions sont en phase avec la trajectoire actuelle du marché de la salle.`;
      }
    } else if (lowerQ.includes('exposition') || lowerQ.includes('position') || lowerQ.includes('quantité')) {
      const heldQty = positions.reduce((acc, p) => acc + p.quantity, 0);
      const notional = Math.round(heldQty * currentPrice * 100) / 100;
      const exposurePercent = totalValue > 0 ? Math.round((notional / totalValue) * 100) : 0;
      answer = `Votre exposition actuelle sur ${symbol} est de ${heldQty} unités, représentant une valeur de marché de ${notional}, soit ${exposurePercent}% de la valeur totale de votre portefeuille. Un niveau supérieur à 50% vous expose fortement aux mouvements brutaux du scénario.`;
    } else if (lowerQ.includes('stop') || lowerQ.includes('stop-loss') || lowerQ.includes('protection')) {
      answer = `Le Stop-Loss est un ordre automatique qui clôture votre position dès que le cours franchit un seuil prédéfini. Il vous garantit de couper vos pertes avant d'atteindre un niveau critique, protégeant ainsi vos ${initialCash} de capital virtuel même en cas de crash violent.`;
    } else if (lowerQ.includes('spread') || lowerQ.includes('carnet')) {
      answer = `Le spread est l’écart entre le meilleur prix d'achat (Bid) et le meilleur prix de vente (Ask), actuellement à ${details.market.spread} sur ${symbol}. Quand le spread augmente, acheter au marché coûte plus cher et vendre rapporte moins.`;
    } else {
      answer = `Actuellement à la minute ${details.room.currentMinute} de « ${details.room.name} », votre portefeuille vaut ${totalValue} (${returnPercent}% de rendement). Vous disposez de ${cash} de cash liquide. Pour bien performer, veillez à ne pas sur-dimensionner vos positions et utilisez toujours des ordres limites ou des Stop-Loss.`;
    }

    return {
      role: 'AI Trading Coach',
      question,
      answer,
      metrics: {
        totalValue,
        cash,
        returnPercent,
        openPositionsCount: positions.length,
      },
    };
  }

  /**
   * 3. AI Performance Evaluator : Bilan complet pédagogique pour l'étudiant et l'enseignant.
   */
  async evaluateStudentPerformance(roomId: string, userId: string) {
    const student = await this.roomService.getStudentPortfolio(roomId, userId);
    const trades = student.trades;
    const pf = student.portfolio;

    const totalTrades = trades.length;
    const buys = trades.filter((t) => t.side === 'buy').length;
    const sells = trades.filter((t) => t.side === 'sell').length;

    let score = 70;
    const feedback: string[] = [];
    const strengths: string[] = [];
    const improvements: string[] = [];

    if (pf.returnPercent >= 0) {
      score += 15;
      strengths.push('Capital préservé : portefeuille dans le vert à la clôture.');
    } else if (pf.returnPercent < -10) {
      score -= 20;
      improvements.push('Perte supérieure à 10% : risque excessif sans couverture Stop-Loss.');
    }

    if (totalTrades >= 2 && sells > 0) {
      strengths.push('Capacité à déboucler des positions et à réaliser ses profits/pertes.');
    } else if (totalTrades === 0) {
      feedback.push('Aucun trade passé : manque de participation active à la séance.');
      score = 50;
    }

    const finalScore = Math.max(20, Math.min(100, score));

    return {
      role: 'AI Performance Evaluator',
      score: finalScore,
      grade: finalScore >= 80 ? 'Excellent' : finalScore >= 65 ? 'Satisfaisant' : 'À perfectionner',
      summary: `Performance globale de ${pf.returnPercent}% avec ${totalTrades} ordres exécutés.`,
      strengths,
      improvements,
      metrics: {
        initialCash: pf.initialCash,
        finalTotalValue: pf.totalValue,
        realizedPnl: pf.realizedPnl,
        unrealizedPnl: pf.unrealizedPnl,
        totalTrades,
        buys,
        sells,
      },
    };
  }
}
