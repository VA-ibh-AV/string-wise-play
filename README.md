# play.string-wise.com

Calm, interactive playgrounds for learning how systems really work.
Part of [string-wise.com](https://string-wise.com) by **@goroutine_guy**.

The blog explains systems internals in long posts. **play** is where you poke at them.
Each project is a small world you can explore for five minutes between tasks. There is no score, no timer and no way to lose, and you come away knowing something real.

| Project | Status | Route | What you learn |
|---|---|---|---|
| **Kernel Cosmos** | Ported (beta) | `/cosmos` | Linux processes, scheduling, memory, page cache, interrupts, cgroups, namespaces, signals |
| Goroutine Lanterns | Idea | `/lanterns` | Go channels, `hchan`, select, deadlocks |
| Packet Garden | Idea | `/garden` | Routing, caching, load balancing |
| Consensus Choir | Idea | `/choir` | Raft leader election and log replication, as sound |
| Data Structure Zen Garden | Idea | `/zen` | B-trees, hash rings, heaps |
| Slow Packet | Idea | `/slow-packet` | One packet's trip: DNS → TCP → NAT → conntrack → socket |

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # vitest: sim + engine unit tests
npm run build        # typecheck + build → dist/
npm run preview
```

### Docker

```bash
docker compose up -d --build     # http://localhost:3007
```

The image runs the unit tests and the build in a `node:22-alpine` stage, then serves `dist/` from `nginx:1.27-alpine` with an SPA fallback (`nginx.conf`). The container is `play-string-wise`, published on host port **3007**.

---

## 1. Principles

1. **Peaceful by default.** Nothing punishes the player. Things break (a process gets OOM-killed), but only because you asked them to, and the world recovers on its own.
2. **Real mechanics, not metaphors pretending.** The simulation follows the real rules: CFS picks the smallest vruntime, SIGKILL waits for D-state I/O, orphans go to PID 1.
3. **Learn by watching, then by poking.** The world runs on its own. Every object can be tapped for an explanation. Actions are one tap away.
4. **Always bridge to the real machine.** Every concept ends with the real command, which can be copied with one tap.
5. **Five-minute sessions.** Opens instantly, no login. Progress is saved in the browser.
6. **Link back to the deep dive.** Each project links to its matching string-wise.com post.

---

## 2. Architecture

A single static site: a hub page plus one lazy-loaded bundle per project. No backend.

| Concern | Choice |
|---|---|
| Build | Vite 6 |
| Shell and UI | React 18 + TypeScript |
| 3D | three.js `0.170.0` (pinned), no react-three-fiber |
| UI state | zustand |
| Sound | Web Audio API, all generated |
| Routing | react-router 6 with lazy routes |
| Tests | Vitest (sim) |

### The golden rule: simulation ≠ rendering

```
   content/ (data)          sim/ (pure TS, no DOM, no three)        view/ (three.js) + ui/ (React)
 ┌──────────────┐        ┌──────────────────────────────────┐     ┌───────────────────────┐
 │ process defs │ ─────► │ World + step(dt), fixed timestep │ ──► │ reads state per frame │
 │ syscalls     │        │ seeded RNG, sim-clock scheduler  │     │ listens to events     │
 │ missions     │        │ emits typed events               │     │ sends commands back   │
 │ lens copy    │        │ accepts commands                 │ ◄── │ (select, signal, …)   │
 └──────────────┘        └──────────────────────────────────┘     └───────────────────────┘
```

- `sim/` never imports three.js or React. It runs in Node for tests.
- The sim steps at 50 Hz (20 ms). Pause / 1× / 2× come from the loop.
- All randomness goes through `world.rng` (seeded). `Math.random` is used only for visual jitter in `view/`.
- No `setTimeout` for game logic. Delayed effects (SIGTERM grace, systemd restart, worker respawn, interrupt travel time, comet flight) use `world.clock.after(sec, fn)`.
- Every state change goes through `transition(w, proc, to, reason)`, which emits `proc.state`.
- Missions complete from sim events only, so each one is unit-tested.

---

## 3. Repository layout

```
play-string-wise/
├── Dockerfile · docker-compose.yml · nginx.conf
├── index.html · vite.config.ts · tsconfig.json · package.json
├── public/
│   ├── favicon.svg
│   └── og/                    # cosmos.png (1200×630 og:image) + SVG card art per project
├── reference/
│   └── cosmos-prototype.html  # original single-file prototype (behaviour reference)
├── packages/                  # shared code, resolved by path alias (@play/*)
│   ├── engine/                # createLoop, createRng, createBus, createClock/after
│   ├── three-kit/             # glowSprite, text factory, linePool, SparkSystem, OrbitFollowCamera, starfield, disposeDeep
│   ├── audio/                 # createSoundscape(): plink, chime, bubble, tick, zap, thud, pad
│   ├── ui/                    # GlassPanel, Pill, StatGrid, CmdButton, CmdList, RichText, Toast
│   └── progress/              # loadProgress / saveProgress / useProgress (localStorage, try/catch)
└── src/
    ├── main.tsx · App.tsx · usePageMeta.ts · styles/tokens.css
    ├── hub/                   # HubPage, ProjectCard, Starfield (2D canvas)
    └── projects/
        ├── types.ts           # ProjectManifest
        ├── registry.ts        # the only file to edit when adding a project
        └── cosmos/
            ├── manifest.ts · index.tsx (route) · controller.ts · store.ts · cosmos.css
            ├── content/       # processes, syscalls, connections, missions, lenses, facts
            ├── sim/           # world, state, scheduler, cgroups, memory, pagecache, interrupts,
            │                  # signals, lifecycle, syscalls, connections, namespaces, missions, events, types
            ├── view/          # scene, stations, beams, planets, comets, overlays, picking, layout, index
            ├── audio/         # cosmosSound.ts (sim events → sounds)
            ├── ui/            # ProcessCard, LensPanel, LensDock, MissionsPanel, HtopBar, FactTicker, Toolbar, Overlays
            └── tests/         # scheduler, memory, signals, missions
```

One Vite app builds everything. `packages/*` are plain folders mapped with `@play/<name>` aliases in `tsconfig.json` and `vite.config.ts` (no workspace install step).

---

## 4. The project contract

Every project exports a `ProjectManifest` (`src/projects/types.ts`) and a lazy route component. The hub and router only read `registry.ts`.

**Lifecycle rules**

- Mount creates the renderer and audio graph; unmount disposes everything (geometries, materials, textures, `renderer.dispose()` + `forceContextLoss()`, the AudioContext, listeners, the RAF loop). Cosmos creates a fresh `<canvas>` per mount so a lost context is never reused.
- The loop pauses while `document.hidden`.
- Deep links use a bare hash token: `/cosmos#memory`, `#scheduler`, `#pagecache`, `#interrupts`, `#cgroups`, `#connections`, `#namespaces`.
- Mission progress is stored under `play.progress.<id>`.

**Checklist for a new project**

- [ ] `src/projects/<id>/` with `manifest.ts`, `index.tsx`, `content/`, `sim/`, `view/`, `ui/`, `tests/`
- [ ] Pure, deterministic `sim/` with at least one Vitest test per mechanic
- [ ] 8–16 missions, each with `how`, `learn` and a real `cmd`
- [ ] Every clickable object explains itself; every lens ends with "Try it on a real machine"
- [ ] Add to `registry.ts`, add `/public/og/<id>.png` (1200×630)
- [ ] Check performance budgets and the mobile layout
- [ ] Link the related string-wise.com post both ways

---

## 5. Kernel Cosmos

> Every planet is a Linux process and its moons are its threads.

| Linux concept | In the cosmos |
|---|---|
| Process | Planet, sized by RSS. Rings when RSS ≥ 100 MB |
| Thread | Moon orbiting its planet |
| CPU core (4) | Star with a beam on the task it runs |
| Syscall | Comet falling toward the caller, labelled `epoll_wait()` etc. |
| R / S / D / T / Z | Bright and fast / dim and resting / pulsing at the disk / frozen / grey husk drifting up |
| Disk | Asteroid station `/dev/nvme0n1` |
| Page cache | Blue nebula, sized by the cache |
| NIC | `eth0` satellite sending interrupt meteors |
| OOM killer | A black hole that swallows the victim |
| Pod | Green PID-namespace bubble |
| cgroup | Constellation lines |
| Socket | Cyan line; data travels as a spark |

**Simulation rules** (all in `sim/`, all tested): CFS by smallest vruntime with `weight = 1024 / 1.25^nice`; SCHED_FIFO first; affinity; last-CPU preference; context-switch counting; woken tasks get `max(own, min_vruntime − 6)`; load average counts R + D. D-state tasks wake only on a disk interrupt to CPU2. NIC interrupts hit CPU0/1, run NET_RX and wake a socket owner; ≥ 5 in 2 s wakes ksoftirqd. kswapd every 0.5 s evicts cache first, then swaps idle tasks largest-first (skipping `oom_score_adj −1000`); OOM picks the highest `oom_score`. COW children start with `shared = 0.8 × parent RSS`. Zombies are reaped after 7 s by their parent (3 s by PID 1); orphans go to PID 1; systemd restarts a killed main process's unit after 8 s with new PIDs; the nginx master respawns a worker after 2.5 s. SIGSTOP/SIGCONT/SIGTERM (pending while stopped)/SIGKILL (pending in D). cgroup `cpu.max` over a 4-slice period.

**Lenses:** Scheduler, Memory, Page cache, Interrupts, Cgroups, Connections, Namespaces.
**HUD:** htop line, fact ticker (every 14 s), toolbar with pause / 1× / 2×, sound, drop syscalls, missions n/16.

### Changes from the prototype

| Prototype | Port |
|---|---|
| One ~1,600-line IIFE | `content/`, `sim/`, `view/`, `ui/` |
| `setTimeout` for grace periods and respawns | `world.clock.after()` on sim time |
| Sim logic triggered by spark / comet arrival in the scene | Sim decides with a fixed travel time; the view animates the same duration |
| `Math.random()` in logic | Seeded `world.rng` |
| `window.__kc` shipped | `window.__cosmos` (`world`, `cmd`, `step(sec)`) only when `import.meta.env.DEV` |
| three r128 from a CDN, `sRGBEncoding` | npm `three@0.170.0`, `outputColorSpace`, texture `colorSpace`, managed colours, light intensities × π |
| `innerHTML` panels | React components reading the zustand store, refreshed on a 300 ms tick |
| No speed control, no pinch | Pause / 1× / 2×, two-pointer pinch zoom |

---

## 6. Visual language

Single dark theme. Tokens in `src/styles/tokens.css`: `--deep #04040E`, `--glass`, `--text #ECEEFA`, `--muted #A3A8CC`, `--faint #6D7299`, `--sun #FFE7A8`, `--run #9EF0B8`, `--sleep #8FC3FF`, `--disk #FFB38A`, `--stop #B7C4E0`, `--zombie #C9C2D6`, `--rt #FF8A7A`, `--cache #8FB8FF`.
Type: Bricolage Grotesque (display), Figtree (body), JetBrains Mono (data). ACES tone mapping, sRGB output, additive glows.

## 7. Performance, accessibility, mobile

- Hub JS ≈ 57 KB gzip (budget 100 KB), no three.js. Cosmos chunk ≈ 156 KB gzip (budget 250 KB).
- Pixel ratio capped at 2; every sprite, comet and popup material is disposed when removed; loop pauses when the tab is hidden.
- `prefers-reduced-motion`: no auto-orbit, no fades on the ticker or toast, static hub starfield.
- Esc closes the card, lens and missions. Visible focus rings. The canvas has an `aria-label`; a polite live region announces selections and mission completions. State pills always show the R/S/D/T/Z letter.
- ≤ 900 px: lens panel at the top, card and missions as a bottom sheet, dock wraps full width, fact ticker hidden. Tap to select, drag to orbit, pinch to zoom.

## 8. Testing

`npm test` runs Vitest over `src/**/*.test.ts` and `packages/**/*.test.ts`. Every test builds a world with a fixed seed and steps it. Covered: CFS order, nice weighting over 100 slices, FIFO priority, affinity, cgroup 0.5 CPU ≤ 2 slices per period, SIGKILL deferred in D until the disk IRQ, SIGTERM delivered on SIGCONT, PID 1 / kernel threads ignoring signals, orphan adoption and systemd restart with new PIDs, zombie reaping timing, nginx worker respawn, OOM after cache eviction then swap, oom_score_adj protection, COW accounting, page-cache hit ratio vs size, and a scripted sequence for each of the 16 missions.

Playwright smoke tests are not set up yet. The dev hook `window.__cosmos.step(sec)` exists for them.

## 9. Roadmap

- [x] Phase 0: single-file prototype (`reference/cosmos-prototype.html`)
- [x] Phase 1: Vite + React + TS app, router, hub, registry, shared packages, Docker image
- [x] Phase 2: Cosmos port — content, pure sim with sim clock and seeded RNG, split view, React panels, unit tests, speed control, pinch zoom, deep links, OG image
- [ ] Playwright smoke tests in CI (SwiftShader flags)
- [ ] Prerender routes so link previews get per-project meta tags
- [ ] Link from the string-wise.com posts
- [ ] Phase 3: launch post and write-up
- [ ] Phase 4: Goroutine Lanterns, Slow Packet, Consensus Choir, Packet Garden, Zen Garden

---

*Built with curiosity by @goroutine_guy · [string-wise.com](https://string-wise.com)*
