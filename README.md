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

You start outside your farmhouse with a 6×6 plot grid, 500 gold, eight turnip
seeds and no army.

It's an open world seen from above. Drag anywhere on the left of the screen for
a floating thumbstick — it appears under your thumb rather than in a fixed spot
— or use WASD / arrows on a desktop. One button in the bottom right does
whatever you're standing next to, and its label tells you what that is.

- **Walk up to bare ground** and the button says *Till*. Then *Turnip*, then
  *Water*, then *Harvest*. One button, always the sensible next thing.
- **The pond** refills your watering can. **The shipping bin** takes your
  harvest, which turns into gold overnight.
- **Go into the farmhouse** and use the bed to sleep and end the day.
- **Follow the road north** to Coldbrook. Six shopfronts you walk into, six
  people who wander the square. Talk to them, give gifts, trade at their
  counter. Mora at five hearts simply builds you a Thresher.
- **The mustering ground**, east of the farm, is where you march. That opens
  the campaign map — the one screen that stays a map, because it is one.

Battles are the other half of the game and they are deliberately not open
world: you place squads on a deployment grid, buy tech, and then the round
resolves itself with no further input. Every decision is made before the
shooting starts. Leaked enemy units damage your Homestead HP; at zero you
retreat.

Win a parcel and it becomes farmland — new rows appear on your plot grid, in
that biome, growing that biome's crops. Buy a coop or a barn and the building
appears on your farm to walk into.

Your army persists between battles within a season and retires at the season
turn. Sixteen parcels across four biomes; take the last one and Endless Defence
opens.

## How it's built

```
server.py            static files + a JSON save API, standard library only
web/js/core/         loop, scene stack, input, state tree, save, seeded RNG
web/js/data/         pure data: crops, items, units, tech, territories, npcs
web/js/world/        tiles, the map, the player and townsfolk, the world scene
web/js/farm/         plot simulation, the day roll, livestock
web/js/battle/       the simulation, deployment, the assault ladder, the viewer
web/js/town/         shop stock, relationships, festivals
web/js/map/          campaign map, endless mode
web/js/render/       procedural sprites, camera, battle effects
tests/               headless sim tests + a browser smoke test
```

Six decisions shape everything else:

**The battle simulation is pure and headless.** `web/js/battle/simulation.js`
steps a fixed 30 Hz tick over plain data driven by a seeded PRNG. It never
touches the DOM, the canvas, `Math.random` or the clock — there is a test that
asserts exactly that. So the same seed always replays the same battle, "skip"
is free, and `tests/sim.test.mjs` can run thousands of battles in Node to check
that no unit or composition dominates.

**State is one JSON-serializable tree.** `web/js/core/state.js` holds
primitives, arrays and IDs — never live object references. Saving is
`JSON.stringify`; loading needs no rehydration.

**One world, not a set of screens.** `world/worldScene.js` holds the farm, the
road and the town in a single walkable tilemap, with a small interior map per
building. Navigation is spatial — you reach a shop by going there. Panels
survive only for things that are genuinely lists (stock, seeds, the bin), and
you open them by standing somewhere rather than by tapping through a menu. The
scene stack above that is shallow: World → Map → Deploy → Battle → Results.

**Terrain is procedural but never shimmers.** Tiles are drawn from a base fill
plus detail placed by a hash of their coordinates, so a grass tuft stays where
it is as the camera pans. Only water animates.

**Zero binary assets.** Every mech, crop and animal in `render/sprites.js` is
drawn from primitives. Mechs are composed from a chassis family and a weapon
type, so a unit's silhouette follows from its role.

**Touch first, and genuinely multi-touch.** The thumbstick and the action button
have to work at the same time, so `core/input.js` tracks every active pointer
and lets a widget *claim* one at press time; claimed pointers are excluded from
tap and drag recognition, so a thumb resting on the stick never registers as a
tap on the world behind it. 46px minimum hit targets and safe-area insets
throughout.

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

The browser suite boots the real server and plays: it walks the player around,
checks trees block movement and the world has no hole in its border, tills a
plot through the action button, walks into a shop and back out, confirms all six
townsfolk exist at real coordinates and wander their patch, runs a battle round,
and round-trips a save.

Balance is asserted rather than eyeballed: no self-sufficient unit may sit
outside a 15–88% win rate at equal gold, and no composition style may beat every
other style. Three units are exempt from the duel check by design — Beekeeper
and Windmill Array deal no damage, and Root Anchor is air-only — so they're
measured by what they do for an army instead.

The browser test needs `npm i` for the Playwright package; the Chromium binary
is already present at `/opt/pw-browsers`, so never run `playwright install`.
