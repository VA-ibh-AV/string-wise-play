export type ModeId = 'free' | 'rr' | 'cfs' | 'prio';

export interface ModeInfo {
  id: ModeId;
  label: string;
  title: string;
  hear: string;
  text: string;
  tries: string[];
  cmds: string[];
}

export const MODES: ModeInfo[] = [
  {
    id: 'free', label: 'Free orbits', title: 'No scheduler at all',
    hear: 'Gentle polyrhythms. Inner planets play more often.',
    text: 'Each planet plays when it crosses the golden line. Inner orbits are faster (Kepler: the square of the period grows with the cube of the radius), so you hear overlapping rhythms. Without a scheduler every task runs whenever it likes, and notes collide.',
    tries: ['Put two planets on the same orbit: they keep the same rhythm forever.', 'Add a planet on the innermost orbit and one on the outermost.', 'Switch to Round robin and hear the collisions turn into a steady pattern.'],
    cmds: ['uptime            # load average: how many tasks want the CPU', 'ps -eo pid,comm,psr,stat'],
  },
  {
    id: 'rr', label: 'Round robin', title: 'Round robin: everyone gets a turn',
    hear: 'A steady arpeggio: each task plays once per cycle.',
    text: 'Time is cut into slices, and the CPU (the star) hands one slice to each task in turn. Every task gets exactly 1/N of the CPU. It is fair, but blind: an important task waits just as long as an unimportant one. This is SCHED_RR within one priority.',
    tries: ['Add a planet and hear the cycle get one note longer.', 'Switch to 2 CPUs: two notes per slice, and the cycle is twice as fast.', 'Try the Lydian scale for a dreamier arpeggio.'],
    cmds: ['chrt -r -p 10 PID                  # make a task SCHED_RR', 'cat /proc/sys/kernel/sched_rr_timeslice_ms'],
  },
  {
    id: 'cfs', label: 'CFS', title: 'CFS: fair, by weight',
    hear: 'Heavier tasks appear more often in the melody.',
    text: 'Linux’s default scheduler (CFS) always runs the task with the smallest vruntime: the one that has had the least CPU so far, adjusted by weight. Each nice step changes weight by 1.25×: weight = 1024 / 1.25^nice. Running adds 1024 / weight to vruntime, so heavy tasks age slowly and get more turns.',
    tries: ['Select a planet and set nice to −8: its note starts to dominate.', 'Set another planet to nice +10 and hear it fade to the background.', 'Watch the share bars: the solid bar meets the dashed promise.'],
    cmds: ['nice -n 10 ./backup.sh', 'renice -n -5 -p PID', 'cat /proc/PID/sched | grep -E "vruntime|weight"'],
  },
  {
    id: 'prio', label: 'Priority', title: 'Strict priority: the highest always wins',
    hear: 'One note repeats; the others go silent.',
    text: 'With real-time priorities (SCHED_FIFO), the highest-priority runnable task always gets the CPU. Everyone below it starves: they get nothing at all. Linux protects itself with RT throttling: by default real-time tasks may use only 95% of each second, so the others can sneak in.',
    tries: ['Give one planet priority 90 and the rest 10: hear the others go silent.', 'Turn on RT throttling: the starved planets get a note now and then.', 'Give two planets the same top priority: they take turns.'],
    cmds: ['chrt -f -p 90 PID                    # SCHED_FIFO, priority 90', 'cat /proc/sys/kernel/sched_rt_runtime_us   # 950000 = 95%', 'ps -eo pid,comm,cls,rtprio'],
  },
];

export const SMP_NOTE =
  'With 2 CPUs, two tasks run in every slice (two notes). More cores means more tasks per slice. With priority, the second core goes to the next-highest task.';
