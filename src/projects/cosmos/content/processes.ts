import type { SyscallName } from './syscalls';

export interface ProcDef {
  pid: number;
  ppid: number;
  comm: string;
  user: string;
  color: number;
  rss: number;
  vsz: number;
  threads: number;
  kind: 'daemon' | 'app' | 'kernel';
  service?: string;
  main?: boolean;
  ns?: string;
  nsPid?: number;
  syscalls: SyscallName[];
  busy: number;
  fds: string[];
  about: string;
  nice?: number;
  shared?: number;
  child?: boolean;
}

const WORKER_ABOUT = 'An nginx worker: a separate forked process, not a thread. One event loop watches thousands of connections with epoll.';

export const NGINX_WORKER: Omit<ProcDef, 'pid' | 'ppid' | 'fds'> = {
  comm: 'nginx: worker', user: 'www-data', color: 0x9be3cb, rss: 11, vsz: 58, threads: 1, kind: 'app', service: 'nginx.service',
  syscalls: ['epoll_wait', 'accept4', 'recvfrom', 'sendto', 'write'], busy: 0.55, about: WORKER_ABOUT,
};

export const PROCESSES: ProcDef[] = [
  { pid: 1, ppid: 0, comm: 'systemd', user: 'root', color: 0xf0c36a, rss: 12, vsz: 170, threads: 1, kind: 'daemon', service: 'init.scope', main: true,
    syscalls: ['epoll_wait', 'openat', 'read'], busy: 0.15, fds: ['3 anon_inode:[eventpoll]', '9 socket:[/run/systemd/notify]'],
    about: 'PID 1, the init system. It starts every service, restarts the ones that die, and adopts orphaned processes. If PID 1 ever exits, the kernel panics.' },
  { pid: 14, ppid: 2, comm: 'ksoftirqd/0', user: 'root', color: 0x8aa0b8, rss: 0, vsz: 0, threads: 1, kind: 'kernel', syscalls: ['nanosleep'], busy: 0.2, fds: [],
    about: 'A kernel thread that finishes network and timer work (softirqs) when interrupts arrive faster than they can be handled inline.' },
  { pid: 142, ppid: 2, comm: 'kworker/1:2', user: 'root', color: 0x8aa0b8, rss: 0, vsz: 0, threads: 1, kind: 'kernel', syscalls: ['nanosleep'], busy: 0.2, fds: [],
    about: 'A kernel worker thread. It runs deferred kernel jobs such as flushing dirty pages to disk. Kernel threads have no user-space memory.' },
  { pid: 412, ppid: 1, comm: 'sshd', user: 'root', color: 0xc7a4ff, rss: 8, vsz: 15, threads: 1, kind: 'daemon', service: 'ssh.service', main: true,
    syscalls: ['recvfrom', 'write', 'accept4'], busy: 0.1, fds: ['3 socket:[TCP *:22 LISTEN]', '4 socket:[TCP 10.0.0.4:22 → you]', '5 /dev/ptmx'],
    about: 'The SSH server. It sleeps almost all the time and wakes only when you type.' },
  { pid: 780, ppid: 1, comm: 'containerd', user: 'root', color: 0xe8a06a, rss: 64, vsz: 1900, threads: 12, kind: 'daemon', service: 'containerd.service', main: true,
    syscalls: ['futex', 'epoll_wait', 'read'], busy: 0.3, fds: ['3 /run/containerd/containerd.sock', '7 /var/lib/containerd/meta.db'],
    about: 'The container runtime. A Go program with many OS threads that the Go scheduler runs goroutines on.' },
  { pid: 901, ppid: 1, comm: 'nginx: master', user: 'root', color: 0x7fd1b9, rss: 6, vsz: 55, threads: 1, kind: 'daemon', service: 'nginx.service', main: true,
    syscalls: ['wait4'], busy: 0.05, fds: ['6 socket:[TCP *:443 LISTEN]', '7 /var/log/nginx/error.log'],
    about: 'The nginx master. It opens the listen socket, forks the workers, and forks a replacement if a worker dies.' },
  ...[0, 1, 2, 3].map(i => ({
    ...NGINX_WORKER, pid: 902 + i, ppid: 901,
    fds: ['6 socket:[TCP *:443 LISTEN] (inherited)', `${20 + i} socket:[TCP → client]`, `${30 + i} socket:[TCP → checkout-api:8080]`],
  })),
  { pid: 1320, ppid: 1, comm: 'postgres', user: 'postgres', color: 0x6fa8ff, rss: 140, vsz: 220, threads: 1, kind: 'daemon', service: 'postgresql.service', main: true,
    syscalls: ['epoll_wait', 'accept4'], busy: 0.1, fds: ['5 socket:[TCP *:5432 LISTEN]', '6 /var/lib/postgresql/16/main/postmaster.pid'],
    about: 'The postmaster. PostgreSQL forks one backend process per client connection, so each client gets its own planet.' },
  ...['app checkout idle', 'app checkout SELECT', 'walwriter'].map((n, i): ProcDef => ({
    pid: 1333 + i * 7, ppid: 1320, comm: 'postgres: ' + n, user: 'postgres', color: 0x93beff, rss: 38, vsz: 225, threads: 1, kind: 'app', service: 'postgresql.service',
    syscalls: n === 'walwriter' ? ['fsync', 'write', 'nanosleep'] : ['recvfrom', 'pread64', 'sendto', 'mmap'], busy: 0.45,
    fds: ['9 /var/lib/postgresql/16/main/base/16384/2619', '10 /var/lib/postgresql/16/main/pg_wal/000000010000000A', '11 socket:[TCP → checkout-api]'],
    about: n === 'walwriter'
      ? 'Writes the write-ahead log and calls fsync, so it often waits in state D.'
      : 'A backend for one client connection. Table reads go through the page cache, and a cache miss waits on disk in state D.',
  })),
  { pid: 1455, ppid: 1, comm: 'redis-server', user: 'redis', color: 0xff7a68, rss: 90, vsz: 160, threads: 5, kind: 'app', service: 'redis.service', main: true,
    syscalls: ['epoll_wait', 'read', 'write'], busy: 0.6, fds: ['6 socket:[TCP *:6379 LISTEN]', '8 /var/lib/redis/dump.rdb'],
    about: 'Redis runs commands on one main thread with an event loop. Its dataset lives in RAM, which makes it a big planet.' },
  { pid: 1602, ppid: 1, comm: 'node_exporter', user: 'nobody', color: 0xb6e07a, rss: 22, vsz: 730, threads: 7, kind: 'daemon', service: 'node-exporter.service', main: true,
    syscalls: ['openat', 'read', 'futex'], busy: 0.25, fds: ['3 /proc/stat', '4 /proc/meminfo', '7 socket:[TCP *:9100 LISTEN]'],
    about: 'Exports metrics by reading files in /proc. Every CPU and memory graph you have seen starts with reads like these.' },
  { pid: 2210, ppid: 780, comm: 'checkout-api', user: 'app', color: 0x5fd4e8, rss: 220, vsz: 1600, threads: 11, kind: 'app', service: 'kubepods/checkout', main: true, ns: 'checkout', nsPid: 1,
    syscalls: ['futex', 'epoll_wait', 'write', 'sendto', 'nanosleep', 'clock_gettime'], busy: 0.7,
    fds: ['3 socket:[TCP *:8080 LISTEN]', '7 socket:[TCP → postgres:5432]', '8 socket:[TCP → redis:6379]'],
    about: 'A Go service in a container. Inside its PID namespace it believes it is PID 1. Goroutines are parked with futex and run on a small pool of OS threads.' },
  { pid: 2231, ppid: 780, comm: 'envoy', user: 'app', color: 0xe7b4ff, rss: 30, vsz: 2100, threads: 4, kind: 'app', service: 'kubepods/checkout', main: true, ns: 'checkout', nsPid: 12,
    syscalls: ['epoll_wait', 'sendto', 'recvfrom'], busy: 0.4, fds: ['5 socket:[TCP *:15001 LISTEN]', '9 socket:[TCP → checkout-api:8080]'],
    about: "A sidecar proxy in the same pod. It shares the pod's PID and network namespaces with checkout-api, so they see each other and talk over localhost." },
  { pid: 3001, ppid: 1, comm: 'cron', user: 'root', color: 0xa8b3c4, rss: 3, vsz: 8, threads: 1, kind: 'daemon', service: 'cron.service', main: true,
    syscalls: ['nanosleep', 'clone'], busy: 0.08, fds: ['3 /var/run/crond.pid', '4 /etc/crontab'],
    about: 'Wakes to check the schedule. When a job is due it calls clone() to fork a child, then reaps it with wait4().' },
];

export const BACKUP_JOB: Partial<ProcDef> = {
  comm: 'backup.sh', rss: 1, syscalls: ['openat', 'pread64', 'write', 'fsync'],
  about: 'A cron job forked by cron. It reads files through the page cache, exits, and waits as a zombie until cron reaps it with wait4().',
};

export const LEAKY_JOB: Omit<ProcDef, 'pid'> = {
  ppid: 412, comm: 'leaky-job', user: 'you', color: 0xe86a9a, rss: 40, vsz: 60, threads: 1, kind: 'app', service: 'user.slice', syscalls: ['mmap', 'write'], busy: 0.9,
  fds: ['3 /tmp/results.csv'], about: 'A batch job with a memory leak. It keeps calling mmap for more memory and never frees any, so RAM fills up.',
};

export const FORK_ABOUT =
  "A fresh child made by fork(). It started as a copy of its parent and shares the parent's memory pages until one of them writes to a page. Then the kernel copies just that page (copy-on-write).";
