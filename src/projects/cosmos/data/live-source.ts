import { LiveStream, type LiveConnection } from '@play/protocol';
import { viewCommand, type Command } from '../sim';
import { LiveAdapter, type LiveState } from './live-adapter';
import type { DataSource } from './source';

export type { LiveConnection };

export interface LiveListener {
  onConnection(c: LiveConnection): void;
  onHello(state: LiveState): void;
}

/**
 * Read-only view of a real host. The stream is one-way from the agent;
 * only view commands (select, lens) are accepted.
 */
export class LiveSource implements DataSource {
  readonly kind = 'live' as const;
  readonly readOnly = true;
  private adapter = new LiveAdapter();
  readonly world = this.adapter.world;
  private stream: LiveStream;

  constructor(listener: LiveListener) {
    this.stream = new LiveStream({
      onConnection: c => listener.onConnection(c),
      onHello: h => {
        this.adapter.hello(h);
        listener.onHello(this.adapter.state);
      },
      onKey: k => this.adapter.key(k),
      onDelta: d => this.adapter.delta(d),
    });
  }

  get state(): LiveState {
    return this.adapter.state;
  }

  start() {
    this.stream.start();
  }

  step(dt: number) {
    this.adapter.step(dt);
  }

  command(cmd: Command) {
    return viewCommand(this.world, cmd);
  }

  stop() {
    this.stream.stop();
  }
}
