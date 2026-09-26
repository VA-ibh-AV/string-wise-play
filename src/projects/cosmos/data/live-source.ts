import { decode } from '@msgpack/msgpack';
import { expand, type LiveMsg } from '@play/protocol';
import { viewCommand, type Command } from '../sim';
import { LiveAdapter, type LiveState } from './live-adapter';
import type { DataSource } from './source';

export type LiveConnection = 'connecting' | 'live' | 'polling' | 'offline';

const DEFAULT_URL = 'wss://live.string-wise.com/stream';

export function liveUrls() {
  const stream = (import.meta.env.VITE_LIVE_URL as string | undefined) || DEFAULT_URL;
  const snapshot = stream.replace(/^ws/, 'http').replace(/\/stream$/, '/snapshot.json');
  return { stream, snapshot };
}

export interface LiveListener {
  onConnection(c: LiveConnection): void;
  onHello(state: LiveState): void;
}

/**
 * Read-only view of a real host. There is no `send` anywhere in this class:
 * the stream is one-way from the agent.
 */
export class LiveSource implements DataSource {
  readonly kind = 'live' as const;
  readonly readOnly = true;
  private adapter = new LiveAdapter();
  readonly world = this.adapter.world;
  private ws: WebSocket | null = null;
  private lastSeq = -1;
  private backoff = 1000;
  private retry = 0;
  private poll = 0;
  private stopped = false;
  private opened = false;
  private failures = 0;
  private snapSeq = -1;
  private urls = liveUrls();

  constructor(private listener: LiveListener) {}

  get state(): LiveState {
    return this.adapter.state;
  }

  start() {
    this.stopped = false;
    this.connect();
  }

  step(dt: number) {
    this.adapter.step(dt);
  }

  command(cmd: Command) {
    return viewCommand(this.world, cmd);
  }

  stop() {
    this.stopped = true;
    window.clearTimeout(this.retry);
    window.clearInterval(this.poll);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  private connect() {
    if (this.stopped) return;
    this.listener.onConnection(this.opened ? 'offline' : 'connecting');
    let ws: WebSocket;
    try {
      ws = this.ws = new WebSocket(this.urls.stream);
    } catch {
      this.scheduleReconnect();
      return;
    }
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      this.backoff = 1000;
      this.failures = 0;
      this.opened = true;
      window.clearInterval(this.poll);
      this.listener.onConnection('live');
    };
    ws.onmessage = m => {
      if (!(m.data instanceof ArrayBuffer)) return;
      let msg: LiveMsg | null = null;
      try {
        msg = expand(decode(new Uint8Array(m.data)));
      } catch {
        return;
      }
      if (msg) this.apply(msg);
    };
    ws.onclose = () => {
      this.ws = null;
      if (this.stopped) return;
      this.failures++;
      this.listener.onConnection('offline');
      // WebSocket refused (for example the viewer cap): the cached snapshot still works
      if (this.failures >= 2 && !this.poll) this.startPolling();
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    // jittered backoff so an agent restart doesn't get every viewer back in the same second
    const wait = Math.min(this.backoff * 2, 30000);
    this.backoff = wait;
    this.retry = window.setTimeout(() => this.connect(), wait / 2 + (Math.random() * wait) / 2);
  }

  private apply(msg: LiveMsg) {
    switch (msg.t) {
      case 'hello':
        this.adapter.hello(msg);
        this.listener.onHello(this.adapter.state);
        return;
      case 'key':
        this.adapter.key(msg);
        this.lastSeq = msg.seq;
        return;
      case 'delta':
        if (this.lastSeq < 0 || msg.seq !== this.lastSeq + 1) return; // gap: wait for the next key
        this.adapter.delta(msg);
        this.lastSeq = msg.seq;
        return;
      case 'bye':
        if (msg.reason === 'overloaded') this.startPolling();
        return;
    }
  }

  private startPolling() {
    window.clearInterval(this.poll);
    const tick = async () => {
      try {
        const r = await fetch(this.urls.snapshot, { cache: 'no-store' });
        if (!r.ok) return;
        const msg = expand(await r.json());
        if (msg?.t === 'key' && msg.seq !== this.snapSeq) {
          this.snapSeq = msg.seq;
          this.adapter.key(msg);
          this.lastSeq = -1; // snapshots are keys only; the next WS key resyncs deltas
          if (!this.ws || this.ws.readyState !== WebSocket.OPEN) this.listener.onConnection('polling');
        }
      } catch {
        /* still offline */
      }
    };
    void tick();
    this.poll = window.setInterval(tick, 3000);
  }
}
