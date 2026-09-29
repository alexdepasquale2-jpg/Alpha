# ZOOM: The Chihuahua in the Ocean: the Contact slice

A playable prototype of the vertical slice in [`docs/ZOOM.md`](../docs/ZOOM.md):
one wing (Contact), three Scars, one chase. Vanilla JS + canvas, no build step, no
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
| Bark | `B` | BARK | R3 |

`R` restarts. `H` shows the title card. `` ` `` toggles a debug readout (`?debug` starts with it on).
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

## Files

```
js/sim.js      the simulation: player physics, grip, rip, throw/jam, hide, Notice, digestion
js/world.js    everything else: gate, warden, mites, panes, Menus, projectiles, teeth, the eye
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
npm run test:zoom       # headless playthrough + browser smoke test
```

## Tuning knobs

All in code, all commented where they live: `LAWS` (rip cost, plant time, tear speed and
width), the Notice tier thresholds and rates in `core.js` / `sim.js: updateNotice`, the
breath cycle (`g.t % 3.8 < 2.5` in `step`), the chase timeline in `world.js: updateChase`
(rolls at 0:30 and 1:36, inhale at 0:50, STATIC at 1:10), and pane sweeps in `level.js`.

## Not in the slice (by design)

Appetite's wearable Laws, Zoo, Interference, The Show, the
tallies that pick an ending (Holes / Leash / Digests are counted and shown on the end card,
but only the crawl-out ending exists here), New Game+. The other eight Laws are only described in the design doc.
