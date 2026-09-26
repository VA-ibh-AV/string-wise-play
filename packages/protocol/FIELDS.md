# cosmos.live.v1 wire field names

Frames are MessagePack maps (WebSocket binary, no deflate). `/snapshot.json` uses the same short keys.
`expand()` in `src/wire.ts` maps short keys to the types in `src/live.ts`. The Go mirror is
`cosmos-agent/internal/protocol`. Unknown keys and unknown event kinds are ignored by the client.

| Message | Wire | Field |
|---|---|---|
| all | `t` | type: `hello` / `key` / `delta` / `bye` |
| hello | `v` `h` `c` `tk` | version, host, caps, tickMs |
| host | `n` `k` `a` `c` `m` | name, kernel, arch, cpus, memTotalBytes |
| key / delta | `s` `ts` `vw` `ld` | seq, ts (agent monotonic ms), viewers, load [1,5,15] |
| key / delta | `cp` `o` `m` `iq` `cg` `e` | cpus, other, mem, irq, cgroups, events |
| key | `p` `cn` | procs, conns |
| delta | `b` `d` `ch` `ca` `cr` | born, died (vpids), changed (patches), connsAdded, connsRemoved (ids) |
| bye | `r` | reason |
| proc | `i` `pp` `n` `k` `s` `th` | vpid, ppid, name, kind, state, threads |
| proc | `c` `r` `mf` `Mf` | cpu (cores), rssBytes, minflt/s, majflt/s |
| proc | `cv` `ci` `sr` `ts` | ctxVol/s, ctxInvol/s, sysRate, topSys |
| proc | `g` `ns` (`p` `n` `m`) `po` `ni` `af` | cgroup label, namespaces, policy, nice, affinity |
| cpu | `i` `b` `v` `sw` | id, busy (0..1), vpid, switches/s |
| other | `n` `c` `r` | count, cpu, rssBytes |
| mem | `t` `u` `c` `d` `w` `s` `st` | total, used, cached, dirty, writeback, swapUsed, swapTotal |
| irq | `n` `c` `r` | name, cpu, rate |
| cgroup | `l` `tp` `mc` `mm` `ok` | label, cpuThrottledPct, memCurrent, memMax (nil = max), oomKills |
| conn | `i` `v` `p` `s` `lp` `r` `rp` | id, vpid, proto, state, localPort (0 = hidden), remote class, remotePort |
| event | `k` `ts` | kind, ts |
| fork | `pa` `c` | parent, child |
| exec | `v` `n` | vpid, name |
| exit | `v` `x` | vpid, code (-1 = unknown) |
| sys | `v` `nr` | vpid, syscall name |
| signal | `sig` `f` `to` `dl` | signal, from, to, delivered |
| oom | `v` | vpid |
| conn | `i` `f` `to` | conn id, from state, to state |

Extensions over the design doc: `load` (`ld`) on key/delta, `viewers` on delta, `swapTotal` (`st`) on mem.
