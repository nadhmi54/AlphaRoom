import { Logger } from '@nestjs/common';
import type { FeedSpec } from './market-feed-config.js';
import type { RealTick } from './price-book.js';

/** Le strict nécessaire d'un WebSocket, pour pouvoir le simuler dans les tests. */
export interface SocketLike {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  send(data: string): void;
  close(): void;
}

export type SocketFactory = (url: string) => SocketLike;

const defaultFactory: SocketFactory = (url) => new WebSocket(url) as unknown as SocketLike;

const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

/**
 * Connexion WebSocket qui se rétablit toute seule (délai doublé à chaque échec,
 * plafonné à 30 s). Les sous-classes disent seulement où se connecter, quoi
 * envoyer à l'ouverture et comment lire un message.
 */
export abstract class WsFeed {
  protected readonly logger: Logger;
  private socket: SocketLike | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private backoff = MIN_BACKOFF_MS;
  private stopped = true;

  constructor(
    name: string,
    protected readonly specs: readonly FeedSpec[],
    private readonly onTick: (tick: RealTick) => void,
    private readonly createSocket: SocketFactory = defaultFactory,
  ) {
    this.logger = new Logger(name);
  }

  /** URL de connexion (peut contenir un jeton : ne jamais la journaliser). */
  protected abstract url(): string;
  protected abstract onOpen(send: (message: unknown) => void): void;
  protected abstract parse(raw: string): RealTick[];

  start(): void {
    if (!this.stopped || this.specs.length === 0) return;
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onclose = null;
      socket.close();
    }
  }

  private connect(): void {
    let socket: SocketLike;
    try {
      socket = this.createSocket(this.url());
    } catch (error) {
      this.logger.warn(`Connexion impossible : ${(error as Error).message}`);
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      this.backoff = MIN_BACKOFF_MS;
      this.logger.log('Flux de prix connecté.');
      this.onOpen((message) => socket.send(JSON.stringify(message)));
    };
    socket.onmessage = (event) => {
      try {
        const raw = typeof event.data === 'string' ? event.data : String(event.data);
        for (const tick of this.parse(raw)) this.onTick(tick);
      } catch {
        // Message illisible : on l'ignore, le flux continue.
      }
    };
    socket.onerror = () => {
      // Le détail est dans `onclose` ; on évite de journaliser l'URL.
    };
    socket.onclose = () => {
      if (this.socket === socket) this.socket = null;
      if (!this.stopped) {
        this.logger.warn('Flux de prix fermé, nouvelle tentative.');
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.timer) return;
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.stopped) this.connect();
    }, delay);
    this.timer.unref?.();
  }
}
