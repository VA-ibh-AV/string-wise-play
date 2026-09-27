export type SyscallName =
  | 'epoll_wait' | 'futex' | 'nanosleep' | 'recvfrom' | 'wait4' | 'pread64' | 'fsync'
  | 'read' | 'write' | 'sendto' | 'accept4' | 'openat' | 'mmap' | 'clock_gettime' | 'clone';

export interface SyscallDef {
  /** State the caller blocks in, if the call blocks. */
  block?: 'S' | 'D';
  /** How long it blocks, in sim seconds. */
  dur?: [number, number];
  note: string;
}

export const SYSCALLS: Record<SyscallName, SyscallDef> = {
  epoll_wait:    { block: 'S', dur: [2, 6], note: 'sleep until one of many sockets is ready' },
  futex:         { block: 'S', dur: [1, 4], note: 'park the thread until a lock frees up' },
  nanosleep:     { block: 'S', dur: [3, 8], note: 'sleep for a fixed amount of time' },
  recvfrom:      { block: 'S', dur: [1.5, 4], note: 'wait for data to arrive on a socket' },
  wait4:         { block: 'S', dur: [4, 9], note: 'wait for a child process to exit' },
  pread64:       { block: 'D', dur: [1.5, 3], note: 'read a file at an offset (page cache or disk)' },
  fsync:         { block: 'D', dur: [2, 3.5], note: 'wait until written data is safely on disk' },
  read:          { note: 'copy bytes in from a file or socket' },
  write:         { note: 'copy bytes out to a file or socket' },
  sendto:        { note: 'hand data to the network stack' },
  accept4:       { note: 'take a new connection off the listen queue' },
  openat:        { note: 'open a file and get a file descriptor' },
  mmap:          { note: 'map more memory into the address space' },
  clock_gettime: { note: 'read the clock via the vDSO, often without entering the kernel' },
  clone:         { note: 'create a new process or thread' },
};

export const SYSCALL_NAMES = Object.keys(SYSCALLS) as SyscallName[];

/** Live hosts report any syscall name, so unknown names fall back to the non-blocking colour. */
export const syscallColor = (n: string) => {
  const block = SYSCALLS[n as SyscallName]?.block;
  return block === 'D' ? '#FFB38A' : block === 'S' ? '#8FC3FF' : '#FFE7A8';
};
export const syscallNote = (n: string) => SYSCALLS[n as SyscallName]?.note ?? 'a system call';
