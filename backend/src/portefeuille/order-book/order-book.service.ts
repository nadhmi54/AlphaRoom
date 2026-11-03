import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, In, IsNull, type EntityManager } from 'typeorm';
import { findMarketAsset } from '../trading/market-assets.js';
import { TradingService } from '../trading/trading.service.js';
import { TradingPortfolio } from '../trading/portfolio.entity.js';
import { TradingPosition } from '../trading/position.entity.js';
import { getProtectionTrigger } from '../positions/protection-trigger.js';
import { OrderBookMark } from './order-book-mark.entity.js';
import { Order, type OrderStatus } from './order.entity.js';
import type { PlaceBookOrderDto } from './dto/place-book-order.dto.js';
import {
  aggregateFills,
  aggregateLevels,
  computeSpread,
  matchOrder,
  roundAmount,
  roundPrice,
  roundQuantity,
  type MatchPlan,
  type RestingOrder,
} from './matching.js';

/** Statuts dont le reliquat peut encore s'exécuter. */
const OPEN_STATUSES: OrderStatus[] = ['open', 'partially_filled'];

/** Nombre de niveaux de liquidité système maintenus de chaque côté. */
const SYSTEM_DEPTH = 4;

/** Notional visé par niveau système, en USD. */
const SYSTEM_LEVEL_NOTIONAL = 20000;

/** Demi-spread de la liquidité système, en points de base (0,05 %). */
const SYSTEM_HALF_SPREAD_BP = 5;

/** Montant minimum d'une exécution, aligné sur la précision du centime. */
const MIN_NOTIONAL = 0.01;

const ADVISORY_NAMESPACE = 'alpharoom.order_book';

@Injectable()
export class OrderBookService {
  private readonly logger = new Logger(OrderBookService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly trading: TradingService,
  ) {}

  // ---------------------------------------------------------------------------
  // Lecture du carnet
  // ---------------------------------------------------------------------------

  /**
   * Photo du carnet pour un actif : bids du plus haut au plus bas, asks du plus
   * bas au plus haut, spread au milieu. Sert l'affichage temps réel (M1).
   */
  async getBook(symbol: string, depth = 12) {
    const asset = this.asset(symbol);

    return this.dataSource.transaction(async (manager) => {
      // Le verrou couvre aussi la réalimentation du carnet : deux lectures
      // simultanées ne peuvent pas insérer deux fois les mêmes niveaux.
      await this.lockSymbol(manager, symbol);
      await this.ensureLiquidity(manager, symbol);

      const orders = await this.openOrders(manager, symbol);
      const resting = this.toResting(orders);
      const bids = aggregateLevels(resting, 'buy', depth);
      const asks = aggregateLevels(resting, 'sell', depth);
      const { bestBid, bestAsk, spread } = computeSpread(bids, asks);
      const mark = await this.mark(manager, symbol);

      return {
        symbol,
        name: asset.name,
        unit: asset.unit,
        referencePrice: asset.price,
        lastPrice: mark ? Number(mark.lastPrice) : asset.price,
        lastTradeAt: mark?.lastTradeAt ?? null,
        bestBid,
        bestAsk,
        spread,
        bids,
        asks,
        updatedAt: new Date(),
      };
    });
  }

  /** Ordres de l'utilisateur, les plus récents d'abord. */
  async listOrders(ownerId: string, status?: OrderStatus) {
    const orders = await this.dataSource.getRepository(Order).find({
      where: status ? { ownerId, status } : { ownerId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return orders.map((order) => this.orderView(order));
  }

  // ---------------------------------------------------------------------------
  // Écriture : passage et annulation d'ordres
  // ---------------------------------------------------------------------------

  /**
   * Point d'entrée unique d'un ordre. Toute la séquence (verrou du carnet,
   * idempotence, appariement, comptabilisation, mise à jour du carnet) se fait
   * dans **une seule transaction** : soit l'ordre est entièrement traité, soit
   * rien ne bouge.
   */
  async placeOrder(
    ownerId: string,
    dto: PlaceBookOrderDto,
    options: { cancelPending?: boolean; closePosition?: boolean } = {},
  ) {
    let quantity = roundQuantity(Number(dto.quantity));
    const limitPrice =
      dto.type === 'limit' ? roundPrice(Number(dto.limitPrice)) : null;

    if (!options.closePosition && quantity <= 0) {
      throw new BadRequestException('La quantité doit être strictement positive.');
    }
    if (dto.type === 'limit' && (limitPrice === null || !(limitPrice > 0))) {
      throw new BadRequestException('Un ordre limite doit préciser un prix limite.');
    }

    return this.dataSource.transaction(async (manager) => {
      await this.lockSymbol(manager, dto.symbol);

      // Idempotence : un renvoi du même requestId (retry réseau) renvoie
      // l'ordre déjà enregistré au lieu de le rejouer.
      const existing = await manager.getRepository(Order).findOne({
        where: { ownerId, requestId: dto.requestId },
      });
      if (existing) return { ...this.orderResult(existing), duplicate: true };

      if (options.cancelPending) {
        await this.cancelPending(manager, ownerId, dto.symbol);
      }

      // Sans liquidité de départ, un premier utilisateur ne pourrait jamais
      // traiter : le carnet se réalimente avant l'appariement.
      await this.ensureLiquidity(manager, dto.symbol);
      const portfolio = await this.trading.lockPortfolio(manager, ownerId);

      if (options.closePosition) {
        const position = await manager.getRepository(TradingPosition).findOne({
          where: { portfolioId: portfolio.id, symbol: dto.symbol },
        });
        quantity = roundQuantity(Number(position?.quantity ?? 0));
        if (quantity <= 0) throw new BadRequestException('Aucune position ouverte à fermer.');
      }

      if (dto.side === 'sell') {
        await this.assertAvailableQuantity(manager, ownerId, portfolio, dto.symbol, quantity);
      }

      const makerOrders = await this.openOrders(manager, dto.symbol);
      let plan: MatchPlan;
      try {
        plan = matchOrder(
          { ownerId, side: dto.side, type: dto.type, quantity, limitPrice },
          this.toResting(makerOrders),
        );
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Exécution trop petite')) {
          throw new BadRequestException(error.message);
        }
        throw error;
      }

      await this.assertFunding(manager, ownerId, portfolio, dto, quantity, limitPrice, plan);

      const order = await this.createOrder(manager, ownerId, dto, quantity, limitPrice);
      const makers = new Map(makerOrders.map((maker) => [maker.id, maker]));
      await this.applyFills(manager, order, plan, makers);
      await this.settleOrder(manager, order, plan, dto.type);
      if (plan.fills.length > 0) {
        await this.recordMark(manager, dto.symbol, plan.fills.at(-1)!.price);
      }

      return this.orderResult(order, plan);
    });
  }

  /**
   * Annule un ordre encore en attente. Le reliquat est libéré : le cash
   * réservé par un achat limite et la quantité réservée par une vente limite
   * redeviennent disponibles.
   */
  async cancelOrder(ownerId: string, orderId: string) {
    return this.dataSource.transaction(async (manager) => {
      const found = await manager.getRepository(Order).findOne({ where: { id: orderId } });
      if (!found || found.ownerId !== ownerId) {
        throw new NotFoundException('Ordre introuvable.');
      }

      await this.lockSymbol(manager, found.symbol);
      const order = await manager.getRepository(Order).findOne({ where: { id: orderId } });
      if (!order) throw new NotFoundException('Ordre introuvable.');
      if (!OPEN_STATUSES.includes(order.status)) {
        throw new BadRequestException('Cet ordre n’est plus en attente.');
      }

      // `remaining_quantity` conserve la quantité non exécutée : l'invariant
      // `filled_quantity + remaining_quantity = quantity` vaut aussi pour un
      // ordre annulé, seul le statut change.
      order.status = 'cancelled';
      order.closedAt = new Date();
      order.updatedAt = new Date();
      await manager.getRepository(Order).save(order);

      return this.orderView(order);
    });
  }

  async closePosition(ownerId: string, symbol: string, requestId: string) {
    const portfolio = await this.dataSource.getRepository(TradingPortfolio).findOne({ where: { ownerId } });
    if (!portfolio) throw new NotFoundException('Portefeuille introuvable.');
    const initial = await this.dataSource.getRepository(TradingPosition).findOne({
      where: { portfolioId: portfolio.id, symbol },
    });
    if (Number(initial?.quantity ?? 0) <= 0) {
      throw new BadRequestException('Aucune position ouverte à fermer.');
    }

    const orders: ReturnType<typeof this.orderResult>[] = [];
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const result = await this.placeOrder(
        ownerId,
        {
          symbol,
          side: 'sell',
          type: 'market',
          quantity: 0.000001,
          requestId: attempt === 0 ? requestId : randomUUID(),
        },
        { cancelPending: true, closePosition: true },
      );
      if (result.filledQuantity <= 0) {
        throw new BadRequestException('Le carnet ne dispose plus de liquidité pour fermer la position.');
      }
      orders.push(result);

      const current = await this.dataSource.getRepository(TradingPosition).findOne({
        where: { portfolioId: portfolio.id, symbol },
      });
      if (Number(current?.quantity ?? 0) <= 0) {
        return {
          symbol,
          status: 'closed',
          filledQuantity: orders.reduce((sum, order) => sum + order.filledQuantity, 0),
          orders: orders.map((order) => order.order),
          fills: orders.flatMap((order) => order.fills),
        };
      }
    }

    throw new BadRequestException('La position n’a pas pu être fermée intégralement.');
  }

  /** Exécute à la prochaine cotation toute protection dont le seuil est atteint. */
  async checkProtections(symbol: string, price: number) {
    const positions = (await this.dataSource.query(
      `select p.owner_id as "ownerId", tp.quantity,
              tp.stop_loss as "stopLoss", tp.take_profit as "takeProfit"
         from public.trading_positions tp
         join public.trading_portfolios p on p.id = tp.portfolio_id
        where tp.symbol = $1 and tp.quantity > 0
          and ((tp.stop_loss is not null and $2 <= tp.stop_loss)
            or (tp.take_profit is not null and $2 >= tp.take_profit))`,
      [symbol, price],
    )) as Array<{
      ownerId: string;
      quantity: string;
      stopLoss: string | null;
      takeProfit: string | null;
    }>;

    for (const position of positions) {
      const trigger = getProtectionTrigger(price, {
        stopLoss: position.stopLoss === null ? null : Number(position.stopLoss),
        takeProfit: position.takeProfit === null ? null : Number(position.takeProfit),
      });
      if (!trigger) continue;

      try {
        await this.closePosition(position.ownerId, symbol, randomUUID());
        this.logger.log(`${trigger} exécuté pour ${symbol} au cours ${price}.`);
      } catch (error) {
        this.logger.error(
          `Échec d'exécution ${trigger} pour ${symbol}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  /**
   * Compatibilité avec le formulaire « Ordre au marché » déjà présent dans la
   * page M1 : même chemin d'exécution que le carnet, réponse à l'ancien format.
   */
  async placeMarketOrder(
    ownerId: string,
    dto: { symbol: string; side: 'buy' | 'sell'; quantity: number; requestId: string },
  ) {
    const result = await this.placeOrder(ownerId, { ...dto, type: 'market' });
    const order = result.order;

    if (!result.duplicate && order.filledQuantity <= 0) {
      throw new BadRequestException(
        'Aucune contrepartie disponible dans le carnet pour cet ordre.',
      );
    }

    return {
      id: order.id,
      symbol: order.symbol,
      side: order.side,
      quantity: order.filledQuantity,
      price: order.averagePrice ?? 0,
      amount: order.notional,
      executedAt: order.createdAt,
      duplicate: result.duplicate,
      cancelledQuantity: order.remainingQuantity,
      fills: result.fills,
    };
  }

  // ---------------------------------------------------------------------------
  // Appariement et comptabilisation
  // ---------------------------------------------------------------------------

  /**
   * Applique les exécutions des deux côtés : l'ordre du carnet (maker) puis
   * l'ordre entrant (taker). Chaque exécution devient une ligne
   * `trade_executions` par partie, rattachée à son propre ordre.
   */
  private async applyFills(
    manager: EntityManager,
    order: Order,
    plan: MatchPlan,
    makers: Map<string, Order>,
  ) {
    const orders = manager.getRepository(Order);

    for (const fill of plan.fills) {
      const maker = makers.get(fill.makerOrderId);
      if (!maker) throw new NotFoundException('Ordre du carnet introuvable.');

      const filled = roundQuantity(Number(maker.filledQuantity) + fill.quantity);
      const remaining = roundQuantity(Number(maker.quantity) - filled);
      maker.filledQuantity = filled.toFixed(6);
      maker.filledAmount = roundAmount(Number(maker.filledAmount) + fill.amount).toFixed(2);
      maker.remainingQuantity = remaining.toFixed(6);
      maker.status = remaining <= 0 ? 'filled' : 'partially_filled';
      maker.closedAt = remaining <= 0 ? new Date() : null;
      maker.updatedAt = new Date();
      await orders.save(maker);

      // La liquidité système n'a pas de portefeuille : seule sa quantité
      // diminue dans le carnet.
      if (maker.ownerId !== null) {
        if (!maker.requestId) throw new Error('Ordre du carnet sans request_id.');
        await this.trading.applyFill(manager, {
          ownerId: maker.ownerId,
          symbol: maker.symbol,
          side: maker.side,
          quantity: fill.quantity,
          price: fill.price,
          amount: fill.amount,
          requestId: maker.requestId,
          orderId: maker.id,
        });
      }

      await this.trading.applyFill(manager, {
        ownerId: order.ownerId!,
        symbol: order.symbol,
        side: order.side,
        quantity: fill.quantity,
        price: fill.price,
        amount: fill.amount,
        requestId: order.requestId!,
        orderId: order.id,
      });
    }
  }

  /**
   * Vérifie que le compte peut honorer l'ordre **avant** d'écrire quoi que ce
   * soit. Les ordres en attente réservent déjà du cash (achats limites) et des
   * quantités (ventes), sinon un même solde pourrait servir deux fois.
   */
  private async assertFunding(
    manager: EntityManager,
    ownerId: string,
    portfolio: TradingPortfolio,
    dto: PlaceBookOrderDto,
    quantity: number,
    limitPrice: number | null,
    plan: MatchPlan,
  ) {
    if (dto.side === 'buy') {
      const cash = Number(portfolio.cash);
      const reserved = await this.reservedCash(manager, ownerId);
      const available = roundAmount(cash - reserved);

      if (dto.type === 'market') {
        if (plan.fills.length === 0) {
          throw new BadRequestException(
            'Aucune contrepartie disponible dans le carnet pour cet ordre.',
          );
        }
        if (plan.notional > available) {
          throw new BadRequestException(
            `Solde insuffisant : il manque ${roundAmount(plan.notional - available).toFixed(2)} USD.`,
          );
        }
        return;
      }

      const needed = roundAmount(quantity * (limitPrice ?? 0));
      if (needed < MIN_NOTIONAL) {
        throw new BadRequestException('Le montant minimum d’un ordre est de 0,01 USD.');
      }
      if (needed > available) {
        throw new BadRequestException(
          `Solde insuffisant : il manque ${roundAmount(needed - available).toFixed(2)} USD.`,
        );
      }
      return;
    }

    await this.assertAvailableQuantity(manager, ownerId, portfolio, dto.symbol, quantity);
  }

  private async assertAvailableQuantity(
    manager: EntityManager,
    ownerId: string,
    portfolio: TradingPortfolio,
    symbol: string,
    quantity: number,
  ) {
    const position = await manager.getRepository(TradingPosition).findOne({
      where: { portfolioId: portfolio.id, symbol },
    });
    const held = Number(position?.quantity ?? 0);
    const committed = await this.reservedQuantity(manager, ownerId, symbol);
    const available = roundQuantity(held - committed);
    if (quantity > available + 0.0000005) {
      throw new BadRequestException(
        `Quantité insuffisante : vous détenez ${available} ${this.asset(symbol).unit} disponibles.`,
      );
    }
  }

  /** Cash immobilisé par les achats limites encore en attente (tous actifs). */
  private async reservedCash(manager: EntityManager, ownerId: string) {
    const open = await manager.getRepository(Order).find({
      where: { ownerId, side: 'buy', type: 'limit', status: In(OPEN_STATUSES) },
    });
    return roundAmount(
      open.reduce(
        (sum, order) => sum + Number(order.remainingQuantity) * Number(order.limitPrice ?? 0),
        0,
      ),
    );
  }

  /** Quantité immobilisée par les ventes encore en attente sur un actif. */
  private async reservedQuantity(
    manager: EntityManager,
    ownerId: string,
    symbol: string,
  ) {
    const open = await manager.getRepository(Order).find({
      where: { ownerId, symbol, side: 'sell', status: In(OPEN_STATUSES) },
    });
    return roundQuantity(
      open.reduce((sum, order) => sum + Number(order.remainingQuantity), 0),
    );
  }

  private async cancelPending(manager: EntityManager, ownerId: string, symbol: string) {
    const repo = manager.getRepository(Order);
    const orders = await repo.find({
      where: { ownerId, symbol, status: In(OPEN_STATUSES) },
    });
    const now = new Date();
    for (const order of orders) {
      order.status = 'cancelled';
      order.closedAt = now;
      order.updatedAt = now;
      await repo.save(order);
    }
  }

  // ---------------------------------------------------------------------------
  // Persistance du carnet
  // ---------------------------------------------------------------------------

  private async createOrder(
    manager: EntityManager,
    ownerId: string,
    dto: PlaceBookOrderDto,
    quantity: number,
    limitPrice: number | null,
  ) {
    const repo = manager.getRepository(Order);
    const saved = await repo.save(
      repo.create({
        ownerId,
        symbol: dto.symbol,
        side: dto.side,
        type: dto.type,
        status: 'open',
        quantity: quantity.toFixed(6),
        filledQuantity: '0.000000',
        remainingQuantity: quantity.toFixed(6),
        limitPrice: limitPrice === null ? null : limitPrice.toFixed(4),
        filledAmount: '0.00',
        requestId: dto.requestId,
      }),
    );
    // `seq` et `created_at` sont générés par Postgres : on relit la ligne pour
    // renvoyer les valeurs réelles (dont la priorité FIFO).
    return repo.findOneByOrFail({ id: saved.id });
  }

  /** Statut final de l'ordre entrant, cohérent avec `filled + remaining`. */
  private async settleOrder(
    manager: EntityManager,
    order: Order,
    plan: MatchPlan,
    type: 'market' | 'limit',
  ) {
    order.filledQuantity = plan.filledQuantity.toFixed(6);
    order.remainingQuantity = plan.remainingQuantity.toFixed(6);
    order.filledAmount = plan.notional.toFixed(2);
    order.updatedAt = new Date();

    if (plan.remainingQuantity <= 0) {
      order.status = 'filled';
      order.closedAt = new Date();
    } else if (type === 'market') {
      // Un ordre au marché ne reste jamais dans le carnet : le reliquat non
      // servi est annulé immédiatement.
      order.status = 'cancelled';
      order.closedAt = new Date();
    } else {
      order.status = plan.filledQuantity > 0 ? 'partially_filled' : 'open';
      order.closedAt = null;
    }

    await manager.getRepository(Order).save(order);
  }

  private async recordMark(manager: EntityManager, symbol: string, price: number) {
    await manager.query(
      `insert into public.order_book_marks (symbol, last_price, last_trade_at, updated_at)
       values ($1, $2, clock_timestamp(), clock_timestamp())
       on conflict (symbol) do update
         set last_price = excluded.last_price,
             last_trade_at = excluded.last_trade_at,
             updated_at = excluded.updated_at`,
      [symbol, price.toFixed(4)],
    );
  }

  private async mark(manager: EntityManager, symbol: string) {
    return manager.getRepository(OrderBookMark).findOne({ where: { symbol } });
  }

  private async openOrders(manager: EntityManager, symbol: string) {
    return manager.getRepository(Order).find({
      where: { symbol, status: In(OPEN_STATUSES) },
    });
  }

  private toResting(orders: Order[]): RestingOrder[] {
    return orders
      .filter((order) => order.limitPrice !== null)
      .map((order) => ({
        id: order.id,
        ownerId: order.ownerId,
        side: order.side,
        price: Number(order.limitPrice),
        remaining: Number(order.remainingQuantity),
        seq: Number(order.seq),
      }));
  }

  /**
   * Maintient une liquidité de marché simulée autour du dernier prix connu.
   * `owner_id = null` : ces ordres n'ont pas de contrepartie comptable, ils
   * représentent le « reste du marché ». Sans eux, un compte seul ne pourrait
   * jamais traiter et le carnet serait vide à l'ouverture de la page.
   *
   * La grille est reconstruite dès qu'elle ne correspond plus aux prix attendus
   * autour du dernier prix exécuté : elle reste ainsi serrée (4 niveaux de
   * chaque côté) au lieu d'accumuler des niveaux obsolètes quand le cours
   * dérive. Une consommation partielle d'un niveau est conservée, elle montre
   * justement que les ordres au marché consomment le carnet.
   */
  private async ensureLiquidity(manager: EntityManager, symbol: string) {
    const asset = this.asset(symbol);
    const repo = manager.getRepository(Order);
    const systemOrders = await repo.find({
      where: { symbol, ownerId: IsNull(), status: In(OPEN_STATUSES) },
    });
    const mark = await this.mark(manager, symbol);
    const reference = mark ? Number(mark.lastPrice) : asset.price;
    const step = Math.max(roundPrice(reference * (SYSTEM_HALF_SPREAD_BP / 10000)), 0.0001);
    const size = roundQuantity(SYSTEM_LEVEL_NOTIONAL / reference);
    if (size <= 0) return;

    const expected: Array<{ side: 'buy' | 'sell'; price: number }> = [];
    for (let level = 1; level <= SYSTEM_DEPTH; level += 1) {
      const bid = roundPrice(reference - step * level);
      const ask = roundPrice(reference + step * level);
      if (bid > 0) expected.push({ side: 'buy', price: bid });
      if (ask > 0) expected.push({ side: 'sell', price: ask });
    }

    const upToDate =
      systemOrders.length === expected.length &&
      expected.every((slot) =>
        systemOrders.some(
          (order) => order.side === slot.side && Number(order.limitPrice) === slot.price,
        ),
      );
    if (upToDate) return;

    await repo.delete({ symbol, ownerId: IsNull() });
    for (const slot of expected) {
      await repo.save(
        repo.create({
          ownerId: null,
          symbol,
          side: slot.side,
          type: 'limit',
          status: 'open',
          quantity: size.toFixed(6),
          filledQuantity: '0.000000',
          remainingQuantity: size.toFixed(6),
          limitPrice: slot.price.toFixed(4),
          filledAmount: '0.00',
          requestId: null,
        }),
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Utilitaires
  // ---------------------------------------------------------------------------

  /**
   * Sérialise les appariements d'un même actif : sans ce verrou, deux ordres
   * simultanés pourraient lire le même carnet et servir deux fois la même
   * contrepartie. Le verrou est libéré à la fin de la transaction.
   */
  private async lockSymbol(manager: EntityManager, symbol: string) {
    await manager.query('select pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
      ADVISORY_NAMESPACE,
      symbol,
    ]);
  }

  private asset(symbol: string) {
    const asset = findMarketAsset(symbol);
    if (!asset) throw new BadRequestException('Actif non disponible dans la simulation.');
    return asset;
  }

  private orderResult(order: Order, plan?: MatchPlan) {
    const view = this.orderView(order);
    if (!plan) {
      // Réponse d'idempotence : le plan d'origine n'existe plus, on repart de
      // la ligne enregistrée (prix moyen reconstitué du montant exécuté).
      return {
        duplicate: false,
        order: view,
        fills: [],
        filledQuantity: view.filledQuantity,
        // Reliquat non servi, déjà libéré (ordre au marché non totalement servi).
        cancelledQuantity:
          order.status === 'cancelled' ? view.remainingQuantity : 0,
        averagePrice: view.averagePrice ?? 0,
        notional: view.notional,
      };
    }

    return {
      duplicate: false,
      // Le prix moyen vient du plan (VWAP des exécutions) : `orderView` le
      // reconstitue depuis le montant arrondi au centime et peut donc dériver
      // de quelques centièmes, y compris pour une exécution unique.
      order: { ...view, averagePrice: plan.averagePrice },
      fills: aggregateFills(plan.fills),
      filledQuantity: plan.filledQuantity,
      cancelledQuantity: plan.cancelledQuantity,
      averagePrice: plan.averagePrice,
      notional: plan.notional,
    };
  }

  private orderView(order: Order) {
    const filled = Number(order.filledQuantity);
    const notional = Number(order.filledAmount);
    return {
      id: order.id,
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      status: order.status,
      quantity: Number(order.quantity),
      filledQuantity: filled,
      remainingQuantity: Number(order.remainingQuantity),
      limitPrice: order.limitPrice === null ? null : Number(order.limitPrice),
      averagePrice: filled > 0 ? roundPrice(notional / filled) : null,
      notional,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      closedAt: order.closedAt,
    };
  }
}
