# Long Way Round

A cozy first-person road trip on an endless, seeded road. Drive through six biomes, park anywhere, walk around, shoot film, develop it at roadside kiosks, refuel, and fill a photo journal. Everything (geometry, textures, music, sound) is generated in code, except the people, who come from the Quaternius CC0 character packs. Built with Vite, TypeScript and Three.js.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # dist/ (multi-file)
SINGLE=1 npx vite build && node scripts/artifact.mjs   # single-file build for hosting as one page
npm test             # determinism, scoring and economy simulation
npm run sim          # economy simulation report only
```

Useful URL flags: `?seed=lantern` (fixed world), `?play` (skip the title), `?hour=17.5`, `?q=low|medium|high`, `?fps` (live counter with draw calls and triangles), `?auto` (autopilot, for screenshots).

## Controls

| Action | Keyboard + mouse | Gamepad |
|---|---|---|
| Steer / walk | A D or arrows | Left stick |
| Throttle / brake-reverse | W / S | RT / LT |
| Handbrake | Space | B |
| Cruise control | C | D-pad up |
| Look | Mouse (click to lock) | Right stick |
| Raise camera | Right mouse or Q (hold) | LB driving, LT on foot |
| Shoot | Left mouse | RT while raised |
| Zoom 24–85 mm | Scroll, = / − | Bumpers (on foot), right stick (driving) |
| Get out / in, interact, talk | F | Y |
| Radio station | R | D-pad left/right |
| Horn | H | Right stick click |
| Atlas / Journal / Gallery | M / J / G | View / D-pad down / pause menu |
| Pause | Esc | Start |

Keys are rebindable in Settings.

## How it's organised

```
src/
  core/      input (keyboard, mouse, gamepad), settings, events, feature flags
  world/     prng, noise, road + terrain + biomes (world.ts), sites (stops, landmarks, towns),
             tile generation (tilegen.ts, runs in a Web Worker), chunk streaming, chunk builders
  render/    toon materials, outline + film post-process, sky, weather, procedural models
  vehicle/   arcade car physics, cockpit + exterior, cosmetics display
  player/    on-foot controller
  camera/    viewfinder + capture, composition scoring, payout rules
  economy/   wallet, film, cosmetics owned, atlas log
  journal/   pages, best photos, milestones
  stops/     stop models and interactions
  life/      animals, traffic, pedestrians, staff, hitchhikers, India-layer events
  audio/     engine, tyres, wind, rain, ambience, spatial calls, generative radio
  ui/        title, pause, panels, atlas, journal, gallery, settings
  save/      IndexedDB persistence
data/        biomes, subjects, cosmetics, dialogue, economy, radio
tests/       determinism, scoring fixtures, economy simulation
scripts/     headless screenshot, profiling and artifact scripts (Playwright)
```

## Design notes

- **Determinism.** One seed string drives everything. Sub-seeds are hashed from (seed, system, index), so any chunk, stop or spawn point can be computed without generating what came before. The main road is a function of station s (equal to world z), so turning around regenerates the road behind you identically.
- **Traffic keeps left and the car is right-hand drive**, matching Indian roads.
- **Economy.** All constants live in `data/economy.ts`. The simulation (`tests/economy.sim.test.ts`) models casual, average and skilled 60-minute sessions; the average player lands at about 1.5× income over spend.
- **India layer.** See `REFERENCES.md` for the scenery sources and the stereotype checklist.
- **Performance.** Vegetation is instanced (one draw call per type, split into a shadow-casting near set and a far set the rear-view mirror skips). Terrain tiles and vegetation are built in a worker; road chunks are built on the main thread in time-sliced steps (about 4 ms per frame). See `perf-log.txt`.

## Known gaps against the spec

- Road chunk geometry is built on the main thread (time-sliced), not in the worker. A cold first build can still take one 35–60 ms step.
- Traffic, people and animals are freed on despawn rather than pooled.
- The city is frontage and a skyline, without drivable side blocks.
- Tea estates at high quality push about 1.2 M triangles per frame (including the shadow pass). Draw calls stay under 190 everywhere.
- The priciest cosmetic (2,000) takes an average player about 25 hours. The spec's 3–4 hour target conflicts with its 1.3–1.6× income ratio; `data/economy.ts` holds the knobs.
