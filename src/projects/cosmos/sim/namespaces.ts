import { procList } from './state';
import type { Proc, World } from './types';

export const insidePod = (w: World) => w.view.lens === 'namespaces' && w.view.nsInside;
/** The PID as seen from where the viewer currently stands. */
export const shownPid = (w: World, p: Proc) => (insidePod(w) && p.ns ? p.nsPid ?? p.pid : p.pid);
export const podMembers = (w: World) => procList(w).filter(p => p.ns && p.state !== 'Z');
