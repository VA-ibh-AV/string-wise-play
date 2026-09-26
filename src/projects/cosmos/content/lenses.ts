/**
 * Lens copy. Paragraph strings support **bold** and `code`.
 * The live part of each lens is rendered by ui/LensPanel.tsx from the world.
 */
export type LensId = 'scheduler' | 'memory' | 'pagecache' | 'interrupts' | 'cgroups' | 'connections' | 'namespaces';

export interface LensDef {
  id: LensId;
  label: string;
  title: string;
  body: string[];
  cmds: string[];
}

export const LENSES: LensDef[] = [
  {
    id: 'scheduler', label: 'Scheduler', title: 'Scheduler · CFS run queue',
    body: [
      'Each beam from a star above is a CPU. Every slice the scheduler gives each CPU to the runnable task with the smallest **vruntime**, the one that has had the least CPU so far. Every switch between tasks costs a context switch: registers are saved and caches go cold.',
      'Real-time **SCHED_FIFO** tasks (red beams) always go first. Pinned tasks only run on the CPUs in their affinity mask.',
    ],
    cmds: ['vmstat 1            # the cs column', 'pidstat -w 1', 'chrt -p PID', 'taskset -cp PID', 'perf sched latency'],
  },
  {
    id: 'memory', label: 'Memory', title: 'Memory · pages, swap, OOM',
    body: [
      'Each process sees its own virtual address space (**VSZ**), but only pages actually in RAM count as **RSS**. Select a planet to see its pages: colored = in RAM, white = shared with its parent after fork (copy-on-write), dark = swapped out.',
      'When free memory runs low, kswapd first evicts page cache, then swaps out idle pages. When swap is full too, the OOM killer steps in.',
    ],
    cmds: ['free -m', 'vmstat 1', 'cat /proc/PID/smaps_rollup', 'dmesg -T | grep -i "out of memory"'],
  },
  {
    id: 'pagecache', label: 'Page cache', title: 'Page cache',
    body: [
      'Linux keeps recently read file pages in RAM: the **page cache**, the blue nebula. A read that hits the cache returns straight from memory. A miss has to go to the disk and the process waits in state D.',
      'This is why `free` often shows little "free" memory. The cache gives memory back the moment programs need it, so it is not wasted.',
    ],
    cmds: ['free -m', 'sync; echo 3 | sudo tee /proc/sys/vm/drop_caches', 'sudo cachestat 1   # bcc tools'],
  },
  {
    id: 'interrupts', label: 'Interrupts', title: 'Interrupts',
    body: [
      "Hardware gets the CPU's attention with an **interrupt**. The handler does the minimum (the \"top half\") and leaves the rest to a **softirq** such as NET_RX. When packets pour in faster than softirqs can run inline, the kernel hands the work to **ksoftirqd**.",
      'Follow a packet: the NIC hits a CPU, NET_RX runs, the data lands on a socket, and the sleeping process that owns it wakes up. Disk interrupts wake processes waiting in state D.',
    ],
    cmds: ['cat /proc/interrupts', 'watch -d cat /proc/softirqs', 'mpstat -I SUM 1'],
  },
  {
    id: 'cgroups', label: 'Cgroups', title: 'Cgroups',
    body: [
      'Every service lives in a **control group**. Lines join the processes in the same cgroup. A cgroup can be given a CPU quota with `cpu.max`: once the group uses its quota for the period, all its tasks are **throttled** until the next period. This is exactly how Kubernetes CPU limits work.',
    ],
    cmds: ['systemd-cgls', 'cat /sys/fs/cgroup/system.slice/nginx.service/cpu.stat', 'kubectl describe pod checkout | grep -A2 Limits'],
  },
  {
    id: 'connections', label: 'Connections', title: 'File descriptors & connections',
    body: [
      'A process talks to the world through **file descriptors**: small numbers indexing its open files. 0, 1 and 2 are stdin, stdout and stderr. Sockets and pipes are file descriptors too.',
      'Glowing lines are TCP connections. When one side writes, the data travels to the peer, and if the peer is asleep in epoll_wait or recvfrom, the kernel wakes it.',
    ],
    cmds: ['ss -tanp', 'lsof -p PID', 'ls -l /proc/PID/fd'],
  },
  {
    id: 'namespaces', label: 'Namespaces', title: 'Namespaces',
    body: [
      'A container is just processes with their own **namespaces**. The green bubble is the checkout pod. Its PID namespace gives it private PID numbers, and its network namespace gives it its own localhost. Mount, UTS, IPC and user namespaces work the same way for other resources.',
    ],
    cmds: ['lsns -p 2210', 'sudo nsenter -t 2210 -p -r ps aux', 'grep NSpid /proc/2210/status'],
  },
];

export const LENS_IDS = LENSES.map(l => l.id);
export const isLensId = (s: string): s is LensId => (LENS_IDS as string[]).includes(s);
