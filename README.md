# CYBER MERGER — Idle Crew Simulator

A cyberpunk **idle merger + base-builder + turn-based hit-mission** game set in a rainy
neon metropolis at night. You run a shady crew: build glowing outposts on a wet concrete
grid, merge cars/guns/agents into stronger tiers, station crew, run contracts, and climb a
tech tree while resources tick up — online and off.

**Play it:** open `index.html` in any modern browser. No build step, no server, no
dependencies, no image or audio files — every pixel and every sound is generated at runtime.

---

## Controls

| Action | How |
| --- | --- |
| Enter the game | Big red **CLICK** on the title screen |
| Build an outpost | Pick one from the left rail, then tap a grid tile |
| Inspect / upgrade an outpost | Tap a placed building |
| Station crew | Pick an agent on the right rail, tap an outpost (or use the CREW screen) |
| Merge | Drag one item onto an identical one, or tap two matching cells |
| Auto-merge | **MERGE** button, the chain strip at the top, or the `M` key |
| Research | **PROGRESSION** → tap a node → **UPGRADE**. Drag to pan, wheel to zoom |
| Fight | **HIT MISSION** → pick a contract → choose an ability each round |
| Ops board | Tap the objective ticker at the top of the base, or press `O` |
| Retire (prestige) | MENU → RETIRE CREW, from level 15 |
| Shortcuts | `1` base · `2` stash · `3` crew · `4` missions · `5` tech · `6` deals · `O` ops board · `m` merge a pair · `M` fuse everything · `Esc` base |

---

## Core loops

**Idle.** Every outpost prints credits, intel, merge chips or energy each second. Closing
the tab keeps it running: offline income pays at half rate and banks up to 8 hours, reported
in a welcome-back panel on your next visit. Backgrounding the tab is covered too — browsers
throttle the animation loop when hidden, so returning to the tab pays out the gap explicitly.

**Merge.** Two items of the same kind *and* tier fuse into one of the next tier. Three
8-step chains — **vehicles** (squad HP + loot), **weapons** (squad damage), **crew**
(the agents who actually fight and staff outposts). Merging pays chips and XP. Your tier
ceiling is set by the tech tree, which is what keeps the board and the tree coupled.
The stash has per-chain filters, a SORT button, and FUSE ALL to chain every available
merge in one go.

**Build.** Five outpost types: DATA NODE (credits), SYNTH DEN (intel), POWER VAULT (energy
cap + regen), GHOST RELAY (buffs orthogonal neighbours) and CHOP FORGE (passive chips).
Twelve levels each. Placement matters because of relay adjacency.

**Crew.** Every agent in the stash is a person. Station one at an outpost to multiply its
output by its tier, or slot it into the strike squad. Squad size grows with tech.

**Missions.** Eight contracts, level-gated, each costing energy. Combat is genuinely
turn-based: your merged squad plus your best weapon and vehicle versus a scaled enemy pack,
and each round you pick **STRIKE / OVERCLOCK / PATCH / SMOKE / BAIL** (or flip on AUTO and
let the built-in brain play it). Wins pay credits, intel, chips and XP with a win-streak
multiplier, and sometimes drop free hardware.

**Heat.** Clearing a contract unlocks the next heat level on it, steppable from the
contract card. Every step multiplies enemy power by 1.34 and the payout by 1.30 — enemies
outpace rewards, so heat is a check on how far your merge tiers have actually come, and it
keeps all eight contracts worth running deep into a run.

**Objectives.** An ops board of five parallel goal chains — build, merge, crew, hits,
research — with one live objective each. The base screen shows the current one as a
progress ticker, so there is always an obvious next thing to do; tap it to claim payouts.

**Retirement (prestige).** From level 15 you can burn the whole operation for **street
cred**: `floor((credits earned this run / 250k) ^ 0.55)`. Each point is permanently +4% to
all income and +2% to loot, damage and toughness. You restart at level 1 with a cash kit,
but keep street cred, lifetime stats, claimed objectives and every heat level you cleared.

**Shady deals.** A black market that rerolls every three minutes: hardware near your tier
cap, timed income boosts, chip caches, intel dumps, stim packs — plus a three-crate gamble
in the back alley.

**Strategy ops.** Unlocked by the WAR ROOM node. A hex territory map with
Food/Wood/Stone/Ore/Gold, eight structures, and GENERATE / SIMULATE / ANALYZE / EXPORT /
PLAY. PLAY converts the operation's score back into crew credits, intel, chips and XP, so
the deeper mode feeds the main game rather than sitting beside it.

---

## Project layout

```
index.html              single page; loads plain scripts in dependency order
css/style.css           the whole neon UI kit (panels, buttons, rails, meters, mobile rules)
js/
  core/
    util.js             math, number formatting, seeded RNG, event bus, canvas helpers
    art.js              ALL art: 5x7 pixel font, item icons, hex buildings, skyline, glyphs
    audio.js            WebAudio blip synth (oscillators + noise, no files)
    rain.js             layered rain, splashes, distant lightning
    state.js            resources, grid, stash, tech, save/load, offline income, all actions
    ui.js               DOM helpers, persistent HUD, toasts, modals, shared item widgets
  data/
    items.js            the three merge chains + combat/economy maths
    buildings.js        outpost definitions, costs, yields
    tech.js             the tech DAG: nodes, prerequisites, costs, effects
    missions.js         contracts, enemy bestiary, player abilities
    objectives.js       the ops-board goal chains
  scenes/
    scene.js            scene base class (DOM overlay lifecycle + canvas hooks)
    title.js            neon logo, perspective grid corridor, CLICK, REWARDS odometer
    base.js             the rainy outpost grid
    merge.js            the stash / merge bay with drag-and-drop
    tech.js             pannable, zoomable node graph
    mission.js          contract select + turn-based combat
    crew.js             squad slots, loadout, roster assignment
    deals.js            black market + crate minigame
    strategy.js         hex territory planner
  main.js               canvas sizing, game loop, scene manager, input, boot
```

### Architecture notes

- **No modules, no bundler.** Everything hangs off one global `CM` namespace and loads as
  classic `<script>` tags, so the game runs straight off `file://` with no CORS issues.
- **Two rendering layers.** Atmosphere (skyline, rain, grid, buildings, tech graph, hex map)
  is drawn on one full-screen canvas; interface is real DOM on top. Each frame is
  `scene.renderBack()` → rain → `scene.renderFront()` → lightning.
- **Scenes never touch the save.** They call action methods on `CM.state`, which mutate and
  emit `state` / `inv` / `tech` on `CM.bus`; open UI re-renders itself from those events.
- **Everything is procedural.** `art.js` generates a 5x7 bitmap font, 24×24 pixel-art item
  icons that shift palette and gain detail per tier, hexagonal prism outposts, and a cached
  three-layer skyline with glitched vertical neon signs.

### Extending it

- New merge chain: add a key to `CHAINS` in `data/items.js` and a matching branch in
  `drawWeapon`/`drawVehicle`/`drawAgent` in `art.js`.
- New outpost: append to `DEFS` in `data/buildings.js` (add a `tech` id to gate it).
- New tech node: append to `NODES` in `data/tech.js` with `col`/`row`, `req` and `effects`;
  the tree lays itself out and `state.js` already understands the effect keys.
- New contract: append to `CONTRACTS` in `data/missions.js`.
- New scene: extend `CM.Scene`, register it as `CM.scenes.<name>`, add the script tag.

- New objective: append to `LIST` in `data/objectives.js`. If it needs a counter that does
  not exist yet, add one case to `statValue()` in `state.js` — nothing else changes.

Save data lives in `localStorage` under `cybermerger.save.v1` (MENU → WIPE SAVE to reset).
MENU → SAVE DATA exports the save as a base64 string and imports one back, so a run can be
moved between browsers or backed up before retiring.
