import { decode } from '@msgpack/msgpack';
import type { Delta, Hello, Key, LiveMsg } from './live';
import { expand } from './wire';

export type LiveConnection = 'connecting' | 'live' | 'polling' | 'offline';

const DEFAULT_URL = 'wss://live.string-wise.com/stream';

export function liveUrls() {
  const stream = (import.meta.env?.VITE_LIVE_URL as string | undefined) || DEFAULT_URL;
  const snapshot = stream.replace(/^ws/, 'http').replace(/\/stream$/, '/snapshot.json');
  return { stream, snapshot };
}

export interface StreamListener {
  onConnection(c: LiveConnection): void;
  onHello(h: Hello): void;
  onKey(k: Key): void;
  /** Only called for deltas that follow the last applied frame. */
  onDelta(d: Delta): void;
}

/**
 * One-way client for the cosmos.live.v1 stream: WebSocket with jittered
 * backoff, snapshot polling when the socket is refused, and seq gap handling.
 * There is no `send` anywhere: the stream only flows from the agent.
 */
export class LiveStream {
  private ws: WebSocket | null = null;
  private lastSeq = -1;
  private backoff = 1000;
  private retry = 0;
  private poll = 0;
  private stopped = false;
  private opened = false;
  private failures = 0;
  private snapSeq = -1;
  /** Snapshots are arriving while the socket is down. */
  private polled = false;
  private urls = liveUrls();

  constructor(private listener: StreamListener) {}

  start() {
    this.stopped = false;
    this.connect();
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
    this.listener.onConnection(this.polled ? 'polling' : this.opened ? 'offline' : 'connecting');
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
      this.poll = 0;
      this.polled = false;
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
      this.listener.onConnection(this.polled ? 'polling' : 'offline');
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
        this.listener.onHello(msg);
        return;
      case 'key':
        this.listener.onKey(msg);
        this.lastSeq = msg.seq;
        return;
      case 'delta':
        if (this.lastSeq < 0 || msg.seq !== this.lastSeq + 1) return; // gap: wait for the next key
        this.listener.onDelta(msg);
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
        if (!r.ok) {
          this.polled = false;
          return;
        }
        const msg = expand(await r.json());
        if (msg?.t === 'key' && msg.seq !== this.snapSeq) {
          this.snapSeq = msg.seq;
          this.listener.onKey(msg);
          this.lastSeq = -1; // snapshots are keys only; the next WS key resyncs deltas
          this.polled = true;
          if (!this.ws || this.ws.readyState !== WebSocket.OPEN) this.listener.onConnection('polling');
        }
      } catch {
        this.polled = false; // still offline
      }
    };
    void tick();
    this.poll = window.setInterval(tick, 3000);
  }
}
