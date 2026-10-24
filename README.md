# Long Way Round

A cozy first-person road trip on an endless, seeded road through India-inspired country. Drive through six biomes (Khasi pine forest, coast, desert, farmland, tropical ghats, city), park anywhere, walk around, shoot film, develop it at roadside kiosks, refuel at real-named fuel stations, eat at dhabas, pick up hitchhikers, and fill a photo journal.

**Play it:** https://blazephoenix.github.io/long-way-around/

The terrain, roads, towns, vehicles, vegetation, sky, music and sound are generated in code. The people, most animals and the wind turbine are off-the-shelf low-poly models (Quaternius, Poly by Google and other Poly Pizza artists), rigged and recoloured at load. The full credits are in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). Built with Vite, TypeScript and Three.js.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # dist/
npm test             # determinism, scoring and economy simulation
```

Pushing to `main` deploys `dist/` to GitHub Pages (`.github/workflows/pages.yml`).

URL flags: `?seed=lantern` (fixed world), `?play` (skip the title), `?hour=17.5`, `?q=low|medium|high`, `?biome=desert` (one biome), `?fps` (frame counter with draw calls and triangles), `?auto` (autopilot), `?gallery` (every model on one lot).

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
  world/     prng, noise, road + terrain + biomes, sites (stops, landmarks, towns),
             tile generation (in a Web Worker), chunk streaming
  render/    toon materials, outline + film pass, sky, weather, models (procedural and loaded)
  vehicle/   arcade car physics, cockpit + exterior, cosmetics
  player/    on-foot controller
  camera/    viewfinder + capture, composition scoring, payouts
  economy/   wallet, film, cosmetics owned, atlas log
  journal/   pages, best photos, milestones
  stops/     stop models and interactions
  life/      animals, traffic, pedestrians, staff, hitchhikers, events
  audio/     engine, tyres, wind, rain, ambience, generative radio
  ui/        title, pause, panels, atlas, journal, settings
  save/      IndexedDB persistence
  gallery/   the ?gallery asset viewer
  assets/    packed models (people, animals, structures)
data/        biomes, subjects, cosmetics, dialogue, economy, radio
tests/       determinism, scoring fixtures, economy simulation
scripts/     asset packers (people, animals, structures) and the single-file build
```

## Design notes

- **Determinism.** One seed string drives everything. Sub-seeds are hashed from (seed, system, index), so any chunk, stop or spawn point can be computed without generating what came before, and turning around regenerates the road behind you identically.
- **Indian roads.** Traffic keeps left and the car is right-hand drive. Place and business names are real; slogans and dialogue are original. `REFERENCES.md` lists the scenery sources and the stereotype checklist every India-layer addition follows.
- **Models.** Loaded models are baked to flat vertex colours to match the toon look. Animals get generated skeletons (legs, neck, tail, wings) and procedural walk, gallop, graze, fly and hover cycles. Only animals with the bones for a motion get it: perched birds never fly, and nothing slides along without moving its legs.
- **Economy.** All constants live in `data/economy.ts`. The simulation (`tests/economy.sim.test.ts`) models 60-minute sessions; the average player earns about 1.5× what they spend.
- **Performance.** Vegetation is instanced (one draw call per type, with near and far sets). Terrain tiles are built in a worker; road chunks are built on the main thread in time-sliced steps (about 4 ms per frame). The budget is under 190 draw calls in every biome.

## Known gaps

- Road chunk geometry is built on the main thread (time-sliced), not in the worker; a cold first build can still take one 35–60 ms step.
- Traffic, people and animals are freed on despawn rather than pooled.
- The city is frontage and a skyline, without drivable side blocks.
- The priciest cosmetic (2,000) takes an average player about 25 hours; `data/economy.ts` holds the knobs.
