export type MissionId =
  | 'inspect' | 'sleep' | 'fork' | 'cow' | 'reap' | 'stopcont' | 'kill' | 'orphan'
  | 'fifo' | 'pin' | 'throttle' | 'cachemiss' | 'majfault' | 'oom' | 'irq' | 'ns';

export interface Mission {
  id: MissionId;
  title: string;
  how: string;
  learn: string;
  cmd: string;
}

export const MISSIONS: Mission[] = [
  { id: 'inspect', title: 'Inspect a process', how: 'Tap any planet.', learn: 'Everything ps and htop show comes from /proc/PID: state, parent, memory, open files.', cmd: 'cat /proc/1/status' },
  { id: 'sleep', title: 'Watch a syscall put a process to sleep', how: 'Select a planet and wait for a blue comet (epoll_wait, futex, recvfrom) to reach it.', learn: 'Blocking syscalls move a task to state S and off the run queue until an event wakes it.', cmd: 'cat /proc/PID/wchan; echo' },
  { id: 'fork', title: 'fork() a process', how: 'Select a planet and press fork().', learn: 'fork() makes a child that shares every page with its parent until one of them writes.', cmd: 'strace -f -e trace=clone,execve bash -c "ls"' },
  { id: 'cow', title: 'Watch a copy-on-write copy', how: 'After a fork, watch the child while it runs.', learn: 'On the first write to a shared page, the kernel copies just that page. That is why fork() is cheap.', cmd: 'grep -i cow /proc/vmstat' },
  { id: 'reap', title: 'Reap a zombie by hand', how: 'Select a zombie (grey, no moons) and press "parent: wait4()".', learn: 'A zombie keeps only its PID and exit status until its parent collects them with wait().', cmd: "ps -eo pid,ppid,stat,comm | awk '$3 ~ /Z/'" },
  { id: 'stopcont', title: 'Stop and resume a process', how: 'Send SIGSTOP, then SIGCONT.', learn: 'SIGSTOP freezes a task in state T. It cannot be caught. SIGCONT resumes it. Ctrl-Z in a shell does this.', cmd: 'kill -STOP PID; kill -CONT PID' },
  { id: 'kill', title: 'Send SIGKILL', how: 'Select a process and press SIGKILL. Try one in state D too.', learn: 'SIGKILL cannot be caught or ignored, but a task in state D only dies after its I/O returns.', cmd: 'kill -9 PID' },
  { id: 'orphan', title: 'Orphan a child', how: 'Kill a parent that has children, such as nginx: master or postgres.', learn: 'When a parent dies, its children are re-parented to PID 1, which reaps them when they exit.', cmd: 'ps -o pid,ppid,comm --ppid 1' },
  { id: 'fifo', title: 'Make a process real-time', how: 'Select a process and press SCHED_FIFO.', learn: 'A SCHED_FIFO task runs before every normal task and keeps the CPU until it blocks.', cmd: 'chrt -f -p 50 PID' },
  { id: 'pin', title: 'Pin a process to one CPU', how: 'Select a process and press "pin to CPU0".', learn: 'CPU affinity limits which CPUs a task may run on. The scheduler will not move it anywhere else.', cmd: 'taskset -cp 0 PID' },
  { id: 'throttle', title: 'Throttle a cgroup', how: 'Open the Cgroups lens and limit the checkout pod to 0.5 CPU.', learn: 'cpu.max gives a cgroup a quota per period. When it is used up, every task in the group waits for the next period.', cmd: 'cat /sys/fs/cgroup/kubepods.slice/*/cpu.stat' },
  { id: 'cachemiss', title: 'See a page-cache miss', how: 'Open the Page cache lens and wait for a read that goes to disk.', learn: 'Reads are served from the page cache when possible. A miss waits on the disk in state D.', cmd: 'free -m   # the buff/cache column' },
  { id: 'majfault', title: 'Cause a major page fault', how: 'Start the memory leak, then watch a swapped-out process run.', learn: 'A major fault means the page had to be read back from disk (swap). A minor fault is served from RAM.', cmd: 'ps -o min_flt,maj_flt -p PID' },
  { id: 'oom', title: 'Get a process OOM-killed', how: 'Memory lens → start the memory leak and let RAM and swap fill up.', learn: 'When memory runs out, the OOM killer picks the process with the highest oom_score and sends it SIGKILL.', cmd: 'dmesg -T | grep -i "out of memory"' },
  { id: 'irq', title: 'Follow a packet from the NIC', how: 'Open the Interrupts lens and watch a packet go NIC → CPU → process.', learn: 'The NIC raises an interrupt, the kernel runs the NET_RX softirq, and data on a socket wakes the sleeping reader.', cmd: 'watch -d cat /proc/interrupts' },
  { id: 'ns', title: 'See a PID from inside a container', how: 'Open the Namespaces lens and switch to the view from inside the pod.', learn: 'A PID namespace gives a container its own PID numbers. checkout-api is PID 1 inside and 2210 outside.', cmd: 'grep NSpid /proc/2210/status' },
];
