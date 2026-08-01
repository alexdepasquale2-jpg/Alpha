# Ironfield

A mobile browser game. You inherit a failing homestead and a rusting mech
workshop on contested land. Farm by day; march at dusk.

**Mechabellum meets Harvest Moon.** The farm is a Harvest Moon day-and-season
loop — till, plant, water, harvest, tend animals, court the town. The war is
Mechabellum — you place squads on a deployment grid, buy tech between rounds,
and then the battle resolves itself with no further input. Crops sell for gold,
gold buys mechs, mechs take land, and the land grows better crops.

Vanilla JavaScript and canvas, no build step and no dependencies. Served by a
standard-library Python script.

---

## Running it

```sh
python3 server.py
```

Then open the printed URLs — `localhost` on this machine, and the LAN address on
your phone. It's designed for a portrait phone screen; add it to your home
screen for fullscreen play.

```sh
python3 server.py --port 9000 --saves-dir /var/ironfield
```

Python 3.11+. Nothing to install.

## Playing

You start with a 6×6 plot grid, 500 gold, eight turnip seeds and no army.

1. **Farm.** Pick a tool from the belt, tap a plot. Till → plant → water →
   harvest. Each action costs energy; sleeping restores it and advances the day.
   Harvested crops go in the shipping bin and convert to gold overnight.
2. **Town.** Six shopfronts. Buy seed and livestock, upgrade tools, and put gold
   and salvage into permanent research. Everyone has heart levels, gift
   preferences, and rewards worth chasing — Mora at five hearts simply builds
   you a Thresher.
3. **March.** Pick a parcel on the map and commit the rest of the day. Buy
   squads, drag them into your three deployment rows, and hit Fight. You cannot
   intervene once it starts — every decision is made before the shooting.
4. **Between rounds** you get reinforcement gold and a choice of tech cards that
   last the season. Leaked enemy units damage your Homestead HP; at zero you
   retreat.
5. **Win the parcel** and it becomes farmland — new rows on your grid, in that
   biome, with that biome's crops.

Long-press anything to inspect it.

Your army persists between battles within a season and retires at the season
turn. Sixteen parcels across four biomes; take the last one and Endless Defence
opens.

## How it's built

```
server.py            static files + a JSON save API, standard library only
web/js/core/         loop, scene stack, input, state tree, save, seeded RNG
web/js/data/         pure data: crops, items, units, tech, territories, npcs
web/js/farm/         plot simulation, day roll, livestock, farm scene
web/js/battle/       the simulation, deployment, the assault ladder, the viewer
web/js/town/         shops, relationships, festivals
web/js/map/          campaign map, endless mode
web/js/render/       procedural sprites, camera, battle effects
tests/               headless sim tests + a browser smoke test
```

Five decisions shape everything else:

**The battle simulation is pure and headless.** `web/js/battle/simulation.js`
steps a fixed 30 Hz tick over plain data driven by a seeded PRNG. It never
touches the DOM, the canvas, `Math.random` or the clock — there is a test that
asserts exactly that. So the same seed always replays the same battle, "skip"
is free, and `tests/sim.test.mjs` can run thousands of battles in Node to check
that no unit or composition dominates.

**State is one JSON-serializable tree.** `web/js/core/state.js` holds
primitives, arrays and IDs — never live object references. Saving is
`JSON.stringify`; loading needs no rehydration.

**Scene stack, not a mode flag.** Farm → Map → Deploy → Battle → Results, with
dialogs pushed as overlays that freeze the scene beneath.

**Zero binary assets.** Every mech, crop and animal in `render/sprites.js` is
drawn from primitives. Mechs are composed from a chassis family and a weapon
type, so a unit's silhouette follows from its role.

**Touch first.** One input module turns pointer events into tap / drag /
long-press. 46px minimum hit targets, safe-area insets, and every primary action
in the bottom third of the screen.

### Saves

Writes go to `localStorage` first — instant, always works — then POST to the
Python host, which writes `saves/<slot>.json` atomically. On load, whichever
copy is newer wins, so losing the network costs you nothing. If the server is
unreachable the game says so and keeps playing locally.

## Tests

```sh
npm test              # headless simulation + balance, no browser needed
npm run test:matrix   # also print the unit and composition win-rate matrices
npm run test:browser  # Playwright: boots the real server, plays a day
npm run test:all
```

The sim suite covers determinism (100 identical replays from one seed),
termination (every unit pairing resolves inside the tick cap), mechanics
(air/ground targeting, splash, armour, veterancy), tech stat composition,
campaign integrity, and balance.

Balance is asserted rather than eyeballed: no self-sufficient unit may sit
outside a 15–88% win rate at equal gold, and no composition style may beat every
other style. Three units are exempt from the duel check by design — Beekeeper
and Windmill Array deal no damage, and Root Anchor is air-only — so they're
measured by what they do for an army instead.

The browser test needs `npm i` for the Playwright package; the Chromium binary
is already present at `/opt/pw-browsers`, so never run `playwright install`.
