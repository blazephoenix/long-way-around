# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The project lives at the repository root; run every command from there. It is a browser game ("Long Way Round"): a first-person, procedurally generated road trip through India-inspired biomes, built with Vite, TypeScript (strict) and Three.js. All geometry, textures, music and sound are generated in code; there are no asset files. `README.md` has controls and the original design notes. Source paths below such as `world/world.ts` are relative to `src/`.

## Commands

```bash
npm run dev                                   # http://localhost:5173
npx tsc --noEmit                              # typecheck (also the first half of `npm run build`)
npm test                                      # vitest: determinism, scoring, economy sim (~1 s)
npx vitest run tests/determinism.test.ts -t "gas stations"   # one test
npm run sim                                   # economy balance report only
SINGLE=1 npx vite build && node scripts/artifact.mjs         # single-file build → artifact/long-way-round.html
```

URL flags for manual checks: `?seed=lantern` (fixed world), `?play` (skip title), `?auto` (autopilot), `?hour=17.5`, `?q=low|medium|high`, `?biome=<BiomeId>` (single-biome world), `?s=<metres>` (spawn station), `?fps` (counter with draw calls and triangles).

`?gallery` opens the asset gallery (`src/gallery/`) instead of the game: every model laid out on one lot with the game's sky, toon ramp and outline pass, a list to jump between them, a time-of-day slider and a variant (seed) stepper. New models get an entry in `src/gallery/assets.ts`. While a model is being reworked, its entry carries a `legacy` builder so old and new stand side by side; once the new one is approved, delete the legacy builder (and `src/gallery/legacy.ts` when it is empty).

### Checking the game in a browser

Use the Claude desktop app's built-in browser (`Claude_Browser` tools) for visual checks. Run `npm run dev` in the background, then `preview_start` on `localhost:5173/?seed=lantern&play&auto&q=low&fps`, and take screenshots with `computer` (action `screenshot`). The tools exist only when the session runs in the Claude desktop app; if they are missing or cannot reach the app, tell the user and stop.

Drive the game by running JavaScript in the page through the debug globals set in `src/main.ts` / `App.newGame`: `window.__game`, `__app`, `__sites`, `__subjects`, `__features`, `__chunkGen`. Typical pattern: `g.stop()`, `g.spawnAt(g.findBiome('city'))`, `g.simulate(seconds)`, then render a frame with `g.tick(1/60, true)`. Before taking a screenshot, wait until `g.streamer.tilesPending === 0`. Two shortcuts: `g.lookAtSite(kind)` frames a site, and `g.renderer.info.render` gives draw calls and triangles.

`scripts/*.mjs` holds the original Playwright versions of these checks (screenshots, `perf.mjs` → `perf-log.txt`, milestone checks `m3check`–`m6check`). Read them for recipes, not to run: they import Playwright from a sandbox path (`/opt/npm-tools/...`) that does not exist here.

## Architecture

**Ownership.** `main.ts` → `ui/App` (renderer, input, settings, audio, title/pause/menus) → `App.newGame()` builds a fresh `Game` per seed. `Game` (`src/game.ts`) owns the scene, world, streamer, car, walker and every system, and `Game.tick(dt, render)` is the whole frame. `simulate(seconds)` runs ticks without rendering for headless use.

**Extension points on `Game`** (prefer these to editing `tick`): `tickers` / `lateTickers` (per-frame callbacks; late ones run after render, used by UI and audio), `saveHooks` (extra save sections), `extraSubjects` (photo subjects from traffic, events), `extraInteract` / `extraPrompt`, and the typed event bus `game.events` (`GameEvents` in `core/events.ts`), which is how the game talks to the UI (subtitle, toast, money, modeChange…).

**Determinism is the core invariant.** `World` (`world/world.ts`), `world/sites.ts` and `world/tilegen.ts` are pure functions of the seed string:
- Randomness comes only from `world/prng.ts`; sub-seeds are `hashInts(seed, system, index)`. `Math.random` belongs only in cosmetic, non-generated effects such as camera shake.
- Every query must be order-independent: any chunk, site or tile can be computed without generating its neighbours first. `tests/determinism.test.ts` checks this by querying forwards and backwards.
- The main road is a function of station `s`, which equals world `z`. `world.road(s)` gives the road's x, y, tangent and normal and the biome blend. Road chunks are `CHUNK = 250` m along z; terrain tiles are `TILE = 256` m with LOD rings.
- The worker (`world/worker.ts`) constructs its own `World` from the same seed. Anything reachable from `World`/`tilegen` must be worker-safe: no DOM and no Three.js scene objects; build plain typed arrays.

**Streaming** (`world/streamer.ts`). Terrain tiles plus instanced vegetation are built in the worker and transferred as typed arrays. Road chunks (asphalt, branches, water, props, and site meshes via the `siteExtra` generator in `world/siteRender.ts`) are built on the main thread by the generator `buildRoadChunkGen`, time-sliced at roughly 4 ms per frame. New per-chunk geometry should `yield` between pieces to keep slices short. Colliders are registered per chunk and queried through `streamer.queryColliders`.

**Content placement vs. behaviour.** `world/sites.ts` decides *where* stops, landmarks and towns go (pure data). `world/siteRender.ts` and `stops/stopModels.ts` decide how they look, and `stops/stops.ts` defines interaction points. `game.ts:pointLabel` gives prompts, and `ui/panels.ts` opens the panels.

**Rendering.** Toon materials share a per-biome gradient ramp (`render/toon.ts`); `render/post.ts` does the outline and film pass, with ink and fog colours blended between adjacent biomes in `Game.updateEnvironment`. Camera layer 1 is far vegetation, which the rear-view mirror skips. Every model is procedural (`render/*Models.ts`, `render/props.ts`). Performance budget: under about 190 draw calls in every biome; vegetation is one instanced draw per type. Baselines are in `perf-log.txt`.

**Data and tuning** live in `data/`: biomes (palette, fog, gradient, adjacency, which the biome sequence must respect), photo subjects, cosmetics, dialogue, radio, and `data/economy.ts` (`ECON`, every economy constant). After touching `ECON`, prices or payouts (`camera/payout.ts`), run `npm run sim`: the target is a 1.3–1.6× income/spend ratio for the average profile (currently 1.51).

**Photo scoring** (`camera/scoring.ts`) is pure given a camera, candidates and an occlusion callback; that keeps it fixture-testable in `tests/scoring.test.ts`. Keep Three.js scene access out of it.

**Saves** (`save/`) go to IndexedDB, slot `slot1`, `version: 1`, and hold runtime state only; generated content is rebuilt from the seed. `Game.restore` merges saves with defaults and remaps renamed cosmetic ids (`RENAMED`). New persisted fields must load from older saves without them, and a renamed id needs a `RENAMED` entry.

## Conventions

- Traffic keeps left and the player car is right-hand drive (the driver's door is on the right). Lane offset is `LANE` in `world/world.ts`.
- The India layer sits behind `FEATURES.india` (`core/features.ts`). Every addition to it follows the stereotype checklist in `REFERENCES.md`. Place and business names are real, not invented: real towns on kilometre stones, real fuel brands and dealer names, well-known dhabas, highway restaurant chains and tourist complexes (lists in `world/sites.ts` and `stops/stopModels.ts`). Each kind walks its list with `cycle()` (`world/prng.ts`) so neighbouring stops never share a name. Slogans, ghat rhymes and dialogue stay original, and paint names describe a colour or car type.
- Known gaps against the original spec are listed at the end of `README.md`; read them before "fixing" behaviour that is deliberately unfinished.
- Formatting follows `.editorconfig`: two-space indent, LF line endings, UTF-8. Node 22 (`.nvmrc`).

## Git

- Branch `main`. History begins with the initial import on 2026-10-15; nothing earlier exists, so `git log` and `git blame` cannot explain older design decisions. Use `README.md` design notes instead.
- Before committing, run `npx tsc --noEmit` and `npm test`. If the change touches `ECON`, prices or payouts, run `npm run sim` and put the new average-profile ratio in the commit message.
- If a change moves draw calls or triangles, re-measure and update `perf-log.txt` in the same commit.
- Not tracked: `node_modules/`, `dist/`, `artifact/` (build outputs) and `.claude/settings.local.json` (per-user). `.claude/settings.json` is shared and tracked.
- Commit only when asked. No remote is configured yet.
