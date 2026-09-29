# ZOOM: The Chihuahua in the Ocean: Contact, Appetite and the Zoo

A playable prototype of [`docs/ZOOM.md`](../docs/ZOOM.md): the Contact slice (three Scars, one chase)
**Wing Two, Appetite** (four Scars, an acid clock, wearable Laws, a stomach that clenches) and
**Wing Three, the Zoo** (four Scars, Menus as enemies and weapons, a cursor that clicks you, closing time). Vanilla JS + canvas, no build step, no
dependencies, no assets (all art is drawn in code and all sound is synthesized).

```sh
npm run zoom            # python3 -m http.server 8321 -d zoom
# then open http://localhost:8321
```

Works on desktop (keyboard or gamepad) and on a phone in landscape (touch controls
appear when you touch the screen).

## Controls

| | Keyboard | Touch | Pad |
|---|---|---|---|
| Run | `A` `D` / arrows | left thumb, floating stick | left stick |
| Jump | `Space` | JUMP | A |
| Climb | hold `Shift`, then `W` `S` | hold GRIP + stick | RT |
| Rip a Law | hold `E`, let go on the bright arc | hold RIP | X |
| Jam / throw | `F`: tap jams, hold throws (`W` `S` aims) | THROW | B |
| Hide | hold `S` / `C` inside a Scar | HIDE | Y |
| Swap mouth/haul (in a Scar: stash) | `Q` | SWAP | LB |
| **Wear** the Law in your mouth / take it off | `V` | WEAR | LT |
| Bark | `B` | BARK | R3 |

The title card has **START** (Contact), **WING 2: APPETITE** and **WING 3: THE ZOO**; `?wing=2` / `?wing=3` in the URL skips
straight there, and each end card has a CONTINUE button that carries your Laws and tallies to the next wing.

`R` restarts the wing you are in. `H` shows the title card. `` ` `` toggles a debug readout (`?debug` starts with it on).
Bark does nothing. That is the joke and the rule.

## What is in it

- **Room A, Mouth of Static.** Slack tongue, tastebud wall, the clenched door (rip WON'T CLOSE),
  the peristaltic gate (jam it in), a warden that sniffs out noisy dogs, mites, Scar 1.
- **Room B, First Rib.** A wall that only holds on the exhale, a mite nest where you land
  (stomp them), the optional TEETH ledge, a Menu that drifts in offering a "helpful" bridge
  (bite it, or walk into it and see what a quest log does to you), the slide, Scar 2.
- **Room C, Window Hall.** Four zones split by curtains, one pane per zone. Panes only see things
  that move, so you stop when they sweep across you. Climb to the hanging pane and rip
  LOOKS THROUGH YOU: that is the third theft, and it opens the eye.
- **The chase, "I LOOKED".** A cone of gaze that tracks you, footprint teeth, the hall rolling
  90 degrees, the gate you left open inhaling, a STATIC pickup that appears at 1:10,
  offerings (throw a Law far away and ZOOM goes to look at it), and Scar 3 inside the one
  hollow molar. Hide in it until ZOOM gets bored and the slice ends.
- **Notice** is never a number on the screen. It shows up as the horizon eye's lid, the
  vignette, the radio static, the heartbeat, the world swaying, and the organs budding teeth.
- **Laws:** WON'T CLOSE, TEETH, LOOKS THROUGH YOU, STATIC. Each does something different to
  each kind of target (see `applyToTarget` in `js/world.js`). WON'T CLOSE and TEETH can each
  open the hollow molar; TEETH on a decoy molar chews it, embarrassed.
- **Failure:** get looked at for 1.7 seconds and you are swallowed, then spat out at the hall
  door minus your heaviest Law.

## Wing two: Appetite

A stomach the size of a city. The twist is that you can **wear** a Law (`V`): a worn Law is a passive
rule on you instead of a thing you throw.

| Law | Ripped from | Thrown / jammed | Worn |
|---|---|---|---|
| THREE HEARTS | a heart valve | onto a crumbling ledge: it holds for good | three sips of acid or bites are absorbed, then it is gone (its own slot, never comes off) |
| LOOKS THROUGH YOU | the tasting window | a see-through window that shows glass platforms for 10 s | a bubble around you: glass platforms go solid, ZOOM sees through it too (Notice drips) |
| GETS BORED | slack curtains | at acid: it ebbs for 14 s. At a maw: it yawns and forgets | Notice drains, the acid rises half as fast, you slouch (slower) |
| LEAVES THE MEETING | bird-door signs | at a maw: it has somewhere to be. At the exit: the door leaves | press `V` again to *leave*: back to your last Scar, Law spent |

- **Acid is the clock.** It rises faster the more ZOOM notices you (+20% a tier). Hiding in a Scar while ZOOM is
  bored (Notice under Stare) makes the whole stomach ebb. Scars the acid has covered will not hide you. Two
  seconds under (1.6 s) and you are swallowed: spat out at your last Scar minus your heaviest Law.
- **Maws** hang on walls, wind up for 0.7 s (a red box shows where they will bite), then snap. A snap eats the
  Law in your mouth and spits it on the floor. Hearts absorb it instead.
- **Crumbling ledges** let go 0.55 s after you stand on them and grow back after 4 s.
- **Glass platforms** are not there unless something is looking through.
- **Rooms:** the Rugae (climb ahead of the lake, wade or hop the gully), the Tasting Room (a chasm of glass under
  two maws), the Maw Gallery (a wall climb past three mouths, with the acid coming up behind), the Gut Cathedral
  (rip the second sign and the stomach clenches; seven balconies, two more maws, and the exit sphincter at the top).
- If a thrown-away Law leaves the wing unbeatable, ZOOM grows another window / sign (`updateSafety` in `appetite.js`).

## Wing three: the Zoo

ZOOM's collection of things it took from Earth, curated, with its interface leaking into the world. **Menus are the
enemy** and you already know how to handle one: bite it, land on it, or walk into it and get a job.

| | |
|---|---|
| **Docents** | floating Menus that wake when you get close and drift at you. Touching one employs you (Leash goes up). They are also fragile: one bite, or land on one from above. |
| **Ticket gates** | turnstiles that want a ticket. A Menu on your back *is* a ticket (the gate waves you through), or bite it six times, or smash it, or walk into it wearing SMASHES MENUS. |
| **Placards** | hang in the air and fire tooltips ("HAVE YOU TRIED BEING USEFUL?") at whatever they can see. Two bites, or a thrown Law. |
| **The trampoline** | is just a pad until you *jump* on it. |
| **The cursor** | ZOOM's attention at colossus scale. It hovers over you, locks a red ring where you are, and clicks 0.45 s later. Keep moving and it hits where you were. |
| **Closing time** | cross the line in Room 4 and three shutters come down, 5, 8.5 and 12 seconds in. Shut in behind one and ZOOM removes you (unless you can break the CLOSED sign). |

| Law | Ripped from | Thrown or jammed | Worn |
|---|---|---|---|
| SMASHES MENUS | a ticket window | at a Menu: it goes berserk for 8 s and smashes every Menu, placard and gate it can see, then itself. At a gate, placard or CLOSED sign: gone | Menus shatter when they touch you, turnstiles and tooltips too. Loud (Notice +0.4/s) |
| OWNS THE ROOM | a coin in a locked cage | anywhere: a crowned pebble becomes the boss of the space for 12 s. Docents crowd it, placards fire at it, the cursor clicks it and is busy for 3 s | docents and placards leave you alone and follow you around like staff. Very loud (+0.8/s) |

- **Rooms:** the Ticket Hall (three bites, a ticket window), Specimen Row (a station wagon to climb, a payphone that is
  out of order forever, a trampoline up to a gallery with a locked coin cage), the Gift Shop (six docents and an exit
  gate), Closing Time (pits with trampolines at the bottom, placards, shutters, the cursor).
- **Choices with a price.** Accepting a Menu gets you through a gate for free and adds to your Leash tally; biting is
  slow and noisy; SMASHES MENUS is fast and loud. The tallies are carried between wings and will pick the ending.
- The Scar just before Closing Time (the Ticket Stub) is where you cool off. At Stare the floor grows teeth ahead of you.
- If a thrown-away Law leaves you unable to open a shutter, ZOOM grows another ticket window.

## Files

```
js/sim.js      the simulation: player physics, grip, rip, throw/jam, hide, Notice, digestion
js/world.js    everything else: gate, warden, mites, panes, Menus, projectiles, teeth, the eye
js/appetite.js wing two: level, acid, maws, glass, crumbles, worn effects, exit
js/render_appetite.js  wing two's look
js/zoo.js      wing three: level, gates, placards, springs, decoy, closing time, the cursor
js/render_zoo.js       wing three's look
js/level.js    the wing, authored as rects
js/laws.js     Law data
js/core.js     shared helpers (gravity tables, Notice tiers, line of sight)
js/render.js   canvas renderer
js/audio.js    synthesized sound
js/input.js    keyboard + gamepad + touch
js/main.js     loop, camera, effects, title and end cards
```

The sim has no DOM in it. `tests/zoom.test.mjs` drives it with a scripted bot through real
inputs (no teleporting in the full-wing run) and asserts every beat of the slice.

```sh
npm run test:zoom       # all three wings, headless, then a browser smoke test
```

`tests/zoom_bot.mjs` is the bot's toolbox. It can fork the game (`structuredClone` plus the RNG state), so it
searches jumps and throws on copies and plays only what worked: `hopChain` plans a run of platform hops and
backs up when a landing leaves no clean next hop. `tests/zoom_appetite.test.mjs` also holds the regression
tests for the mantle bug (below).

### A bug worth remembering

Climbing to the top of a wall used to fling the dog across the map. The mantle added a "lean into the wall"
speed to the velocity every frame, and the velocity is re-read every frame, so it compounded (about 2,900
px/s after half a second). It is now a displacement only (`lean` in `updatePlayer`), and velocity is clamped as
a backstop.

## Tuning knobs

All in code, all commented where they live: `LAWS` (rip cost, plant time, tear speed and
width), the Notice tier thresholds and rates in `core.js` / `sim.js: updateNotice`, the
breath cycle (`g.t % 3.8 < 2.5` in `step`), the chase timeline in `world.js: updateChase`
(rolls at 0:30 and 1:36, inhale at 0:50, STATIC at 1:10), and pane sweeps in `level.js`.

## Not in the slice (by design)

Interference, The Show, the
tallies that pick an ending (Holes / Leash / Digests are counted and carried from wing to wing,
but only the crawl-out ending exists), New Game+. BLUE BLOOD, WATCHES AFTER and PRODUCER are only described in the design doc.
