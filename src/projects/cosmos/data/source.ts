import type { Command, World } from '../sim';

export type SourceKind = 'mock' | 'live';

/**
 * Where a Cosmos world comes from. The view and UI only ever read `world`;
 * `command` is the single way anything can change it.
 */
export interface DataSource {
  readonly kind: SourceKind;
  /** When true, only view commands (select, lens, namespace view) are accepted. */
  readonly readOnly: boolean;
  readonly world: World;
  start(): void;
  /** Called at the fixed step rate with sim seconds. */
  step(dt: number): void;
  command(cmd: Command): number | void;
  stop(): void;
}
