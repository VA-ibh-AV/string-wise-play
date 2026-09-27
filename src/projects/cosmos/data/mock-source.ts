import type { MissionId } from '../content/missions';
import { command, createWorld, step, type Command, type World } from '../sim';
import type { DataSource } from './source';

/** The Sandbox: the deterministic kernel simulation. Everything is allowed. */
export class MockSource implements DataSource {
  readonly kind = 'mock' as const;
  readonly readOnly = false;
  readonly world: World;

  constructor(opts: { seed: number; done: MissionId[] }) {
    this.world = createWorld(opts);
  }
  start() {}
  step(dt: number) {
    step(this.world, dt);
  }
  command(cmd: Command) {
    return command(this.world, cmd);
  }
  stop() {}
}
