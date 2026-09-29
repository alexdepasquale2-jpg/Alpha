# ZOOM: THE CHIHUAHUA IN THE OCEAN

*Game concept + 20-minute vertical-slice design.*
*Rule zero: if a system isn't fun in the hands, cut it.*

> **Playable:** the §8 slice (Contact), Wing Two (Appetite) and Wing Three (the Zoo) are built. See [`zoom/README.md`](../zoom/README.md), or `npm run zoom`.

---

## 1. Pitch

You are a small, loud signal from Earth, shaped like a chihuahua, and you have been swallowed by ZOOM, an alien intelligence the size of an ocean and the temperament of a bored god. ZOOM is the dungeon and the villain: its rooms are organs made of ideas (ribs of appetite, lungs of weather, teeth that won't close). You are a parasite, not a prophet. You climb the anatomy, **rip Laws out of it** (physical chunks of reality that carry one rule), and **throw or jam them into other things** so those things obey the rule. Every theft makes ZOOM more interested in you. When it Notices, the room turns on you, then the whole ocean does. You survive by hiding inside old wounds until it gets bored and looks away. Nobody is coming and there is no destiny. You are here to leave wearing a piece of it.

**One-liner:** *Shadow of the Colossus if the colossus were the level, the dog were the boss, and the dog stole its ribs.*

**Tone:** radio-alien, mean, funny, a little sad. ZOOM never insults you. It is simply not paying attention, which is worse.

---

## 2. Player fantasy and forbidden mechanics

**Fantasy:** be the tiny thing that picks a fight with a cathedral and steals pieces of it.

**What you are:** fast, sticky, greedy, easy to squash. You have no health bar, no weapon and no damage number. Your power is that you can steal rules.

**The single resource: NOTICE.** Greed raises it. Hiding and waiting lowers it. There is no Notice bar. You read it off the world (see the tier table below). Boredom is not a currency you manage. It is ZOOM's mood, and it is the monster's only weakness.

| Tier | What ZOOM is doing | What you see, hear and feel |
|---|---|---|
| **Asleep** | Ignoring you | Organ breathes slow. Idle hum. Rips are quiet. |
| **Twitch** | Reacting without looking | Doors sulk shut. Floor tilts 5-10°. Dust falls. Distant thunder on the beat of your steps. |
| **Stare** | The room hunts you | Wardens wake. Teeth bud. Gravity leans. An eye-shaped patch of weather starts sweeping. |
| **Notice** | ZOOM turns around | The chase (see §6). |

**Forbidden mechanics.** These are cut for good. If a build contains them, the build is wrong.
- Talking, typing, radio-tuning, frequency puzzles, "say the word to unlock the door." Barking is a button that does nothing mechanically. That is the joke, and dialogue is flavor only.
- Dialogue trees that unlock verbs, or "scan to learn" lore.
- Quest logs, objective markers, XP, skill trees, upgrade menus, currency.
- Combat with a damage number on ZOOM. You never DPS the ocean.
- Collectible lore rooms. A room with no rip, no throw target and no hiding spot is cut.
- **Becoming "useful" is a failure state** (see Menus, §3). ZOOM sometimes grows a UI to make you a productive employee. You smash it.

---

## 3. Minute-to-minute loop

One loop, roughly 90-150 seconds each turn:

1. **Read the room.** Something looks illegal: a seam that glows, a tooth that's too clean, a door clenched like a jaw.
2. **Climb** to it under mild threat (mites, a warden, a breathing floor).
3. **Rip.** The room flinches. Notice steps up one notch.
4. **Improvise.** Your Law is a rule in your mouth. Throw it or jam it into a door, an enemy, a floor or a gap and see what the world does.
5. **Push or hide.** Push your luck for one more rip, or dive into a **Scar** and wait until the light goes flat.
6. **Exit** into the next organ still carrying one stolen rule. Repeat.

**Carry rules.** You hold at most **two** Laws. One is in your **mouth** (fast, throwable) and one is **hauled** on a sinew rope behind you (slow, and it snags on ledges). A third rip forces a drop or a jam. A Law you throw or jam is **consumed**: it stays in the target permanently. A miss leaves the Law on the floor to pick up again.

**Scars** are old wounds that predate you, hand-placed in every room. Inside one, ZOOM can't see you. Hold still and the room slackens. Each Scar is also your checkpoint. Scars hold one stashed Law that is safe from digestion.

**Menus** are ZOOM's attempt to make you productive: floating checklists, glowing arrows, "OBJECTIVE: RIP 3 TEETH (0/3)". Touching one accepts it. Nothing is free about it. Your Notice floor rises one tier, the screen grows a real quest tracker, and everything in view turns into a chore. Smash it (bite, jump on it, or throw a Law at it) to go back to normal. Menus show up when you have been safe and comfortable for too long, which is exactly when you should have been ripping something.

**Failure.** You die by being **pinned** while Notice is at maximum. You are digested, then spat out at the last Scar, and you lose your heaviest Law. The cost is 30-90 seconds and one Law, never a save reload.

**Controls (pad).** Left stick move · A jump/vault · hold RT grip/climb · X rip/bite (hold and pull) · B throw (hold to aim, release) · tap B at contact range to **jam** · Y crouch/hide (hold to still in a Scar) · LB bark (cosmetic).

---

## 4. Laws

Twelve Laws. The rules for all of them:
- A Law is a **verb**. Jam it into a **noun**: an opening, a surface, a body, a watcher, a menu or a tiny thing.
- A target holds **at most two** Laws. The second one to arrive reads the first.
- Each Law has a **cost** (how loud the rip is) and a **backfire** (how it hurts you).

| # | Law | Rip it from | Jam/throw effect | Backfire |
|---|---|---|---|---|
| 1 | **WON'T CLOSE** | Clenched doors, jaws, sphincters | Target can't shut, seal, clamp or heal. | Jam it into a Scar and that Scar can't hide you anymore. |
| 2 | **TEETH** | Molars, sleeping mouths | Surface grows biting teeth in ~3 s. Bites anything that touches it. | A miss puts teeth on the floor you still have to cross. |
| 3 | **LOOKS THROUGH YOU** | Watching panes (bits of ZOOM's eye) | Wall or thing goes transparent for ~10 s. You see hidden Scars and enemies. Worn: sight-based enemies look past you if you stand still. | ZOOM sees through it too. Notice ticks up while a window is open. |
| 4 | **LEAVES THE MEETING** | Bird-doors, exit signs, wandering ushers | Target gets up and walks off for ~20 s. A door that leaves becomes a permanent opening. | On yourself it is a panic eject to the last Scar, minus your heaviest Law. |
| 5 | **GETS BORED** | Old sleeping things, gone-slack curtains | Target drops its chase if nothing new happens to it for ~4 s. | It also makes allies wander off. |
| 6 | **SMASHES MENUS** | Menu-shaped turrets, ticket windows | Target attacks any Menu or UI-shaped enemy in range. Worn: you shatter Menus by touch. | Also smashes helpful things that look like Menus (signposts, ladders with rungs like list items). |
| 7 | **THREE HEARTS** | Heart-valves, bell-shaped muscles | Target needs three big hits or events to break. | On an enemy it gets tougher. Hold this thought. |
| 8 | **BLUE BLOOD** | Bruised ribs, old wounds | A wounded target leaves a climbable, tacky blue trail. | Blue trails glow, so they show up to watchers. |
| 9 | **OWNS THE ROOM** | Small forgotten objects (stones, keys) | A tiny object becomes what the room looks at. Enemies flock to it. The eye faces it. | It holds only until someone picks it up or moves it. |
| 10 | **WATCHES AFTER** | Solved puzzles, closed locks | Target grows an eye and stands sentry. Enemies won't cross its gaze. | It reports to ZOOM if you enter its line. |
| 11 | **STATIC** | Floor pickup only (never ripped) | ~6 m bubble for ~5 s: nothing outside sees in, and you see only 2 m. Notice falls at Scar speed. | You are blind inside it, and so is the thing chasing you. |
| 12 | **PRODUCER** | Late game only | Target starts directing: any Law thrown near it copies onto 2 nearby things. | Every copy raises Notice. It takes credit for everything. |

### How they combine

Combos are read by *nouns*, not recipes. If you want a hallway that bites, you build it with two Laws and a place to stand. There is no crafting menu.

| Combo | Result |
|---|---|
| **WON'T CLOSE + TEETH** on one gap | A hallway that bites and never shuts. Run it once, then use it as a kill lane. |
| **WON'T CLOSE + a Scar** | The Scar can no longer hide you but stays open. It becomes a tunnel through the wall. |
| **LOOKS THROUGH YOU + a Scar** | Hide in a wound and see the next organ through the wall. Scout from safety. |
| **TEETH + BLUE BLOOD** | A biting bridge that bleeds a climbable rope up the ceiling whenever it bites. |
| **THREE HEARTS + TEETH** | A barricade that survives three chases before the mouth gives out. |
| **BLUE BLOOD + THREE HEARTS** on a chaser | It takes three hits and bleeds three ropes. Climb it like a ladder. |
| **LEAVES THE MEETING** on a door | Permanent opening. On a Menu it walks off. |
| **WATCHES AFTER + LEAVES THE MEETING** | A stalker that leaves to watch other rooms, then returns and tells you what it saw. |
| **OWNS THE ROOM** on a pebble, then **GETS BORED** on the pebble | The room stares at the pebble, then gets bored *of it*, and its attention drops away with it. The boss-scale bait-and-bore. |
| **STATIC + LOOKS THROUGH YOU** | Clear vision inside the fog. You are the only one who can see. |
| **PRODUCER + SMASHES MENUS** | Every Menu in the room starts smashing every other Menu. This is how you wreck the Zoo wing. |
| **PRODUCER + STATIC** | The whole room goes quiet for a full minute. After it fades, Notice jumps one tier: the Producer takes credit. |

---

## 5. How the verbs feel

**Run.** Short legs, huge stride, low camera. You skid when you turn. You never feel dignified. Sprint has a two-second build: the first steps are frantic, the fifth is a streak. Coyote-time is generous so you never feel the floor betraying you.

**Climb.** Sticky and big. Handholds are ligaments, serifs, tooth-ridges and tendons, and each has a *grip character*: cold, twitchy, slick or dead. Hold RT to grip; release to drop. The camera pulls out as you climb so you feel small on a moving rib. Breathing walls change your grip, so you hold on exhale and lunge on inhale. Nothing demands a stamina bar. The organ *moves*, and that's the difficulty.

**Rip.** A two-beat heist. *Beat one:* plant. Bite into the seam and hold; the wall tenses and a tell-tale hum rises. *Beat two:* tear. Pull the stick back against the chunk's resistance (each Law has a different wobble: WON'T CLOSE resists, LOOKS THROUGH YOU flickers, TEETH snaps). Get the timing right and the chunk comes free with a wet radio crackle, a controller lurch, a half-second of hit-stop, and the whole room flinches. Miss it and the chunk tears halfway and hurts your jaw: it comes free but Notice jumps two steps instead of one. The Law sits heavy in your mouth: your head drops and your run slows.

**Throw.** Not a gun. It arcs like a brick, weighted by size. Aim with a dotted arc. On impact the rule *writes* itself onto the target: texture swap, sound swap, behavior swap. It's not a numeric effect. It's a visible change to the world. Misses are funny and cost you: TEETH on the floor you still have to cross.

**Jam.** Tap B at contact range. It's slower than a throw but guaranteed: you stab the Law into a gap and it stays.

**Hide.** Nothing dramatic. Squeeze into a Scar, hold Y, and let the room go dull. ZOOM's attention slides off you like rain off a window. You feel the ocean *lose interest*: distant thunder slows, the horizon-eye lids droop, the pinned things unclench. Boredom you can *hear*.

---

## 6. Boss-scale chase rules

When Notice hits maximum, ZOOM becomes the boss. There is no arena load. The room you are standing in becomes the arena, and it's the same room you have been robbing.

1. **One attention.** An eye-shaped weather system, a horizon-sized pupil, turns to face you. It sweeps in a cone. If its center rests on you for **2 seconds**, you are pinned. The more Laws you carry, the tighter and faster the cone.
2. **Footprint teeth.** Your last three footprints sprout teeth about a second after you leave them. You cannot run straight for long. Zigzag, hop and climb.
3. **The organ rolls.** Every ~20 s gravity rotates 90° (telegraphed by creaking and falling dust). Floors become walls. Everything you climbed becomes a fall.
4. **Your own Laws turn on you.** ZOOM re-aims one Law you embedded earlier in the wing per phase. Your WON'T CLOSE gate inhales like a throat. Your TEETH barricade extends onto the route. This is why the chase teaches you to place Laws thoughtfully.
5. **You never damage the ocean.** You end the chase by:
   - **Breaking line of sight** behind mass (ribs, hanging curtains, doors that leave).
   - **STATIC** thrown at the eye, then dive into a Scar.
   - **Offering.** Throw any raw Law far away. ZOOM is drawn to it like a magpie, looks at it for ~6 s, and you get away. You lose the Law. Greed versus safety.
   - **Bait and bore** (mid-game): pebble + OWNS THE ROOM, then GETS BORED.
   - **Hiding** in a Scar until Notice falls to Stare.
6. **Chase ends** when Notice drops below Stare *and* the eye is looking elsewhere. The organ relaxes with an audible sag.
7. **If pinned**: a short, ugly, funny digestion cutscene (under 10 s, skippable), then you are spat out at the last Scar minus your heaviest Law. Each pin also tightens the ending toward "Channel" (§7).

---

## 7. Campaign, in five wings

Each wing adds *one* new verb-on-Laws, not a new activity.

| Wing | Organs | New twist | Length |
|---|---|---|---|
| **Contact** | Mouth, ribs, window hall | Learn rip/throw/jam/hide. First chase. | 1.5-2 h |
| **Appetite** | Stomach-cities, acid lungs, gut-cathedrals | **Wear** a Law. The environment digests you on a clock, so speed matters. | 2 h |
| **Zoo** | ZOOM's cages of collected Earth-things: payphones, cars, a lonely trampoline | **Menus as combat.** SMASHES MENUS is a weapon. Cages are hosts for Laws. | 2 h |
| **Interference** | The mess where ZOOM's thoughts conflict: static reefs, jittering tissue, pests | **Pests as thrown Laws.** Live mites carry a rule to wherever you sling them. | 2 h |
| **The Show** | An enormous stage where ZOOM performs a *dog* | **The dungeon rips you.** ZOOM steals your Laws back and you steal them again. | 2 h |

### Endings

Endings are picked by what you *did*, not by a dialogue choice. Three hidden tallies (never shown):
- **Holes** = Laws ripped.
- **Leash** = Menus you accepted.
- **Digests** = times you were pinned.

1. **Crawl Out.** You reach the exit wearing a trophy-organ (a worn Law grows into you). Leash and Digests low. You are free and slightly ridiculous.
2. **Channel.** Leash or Digests high. You get digested and become a channel: ZOOM broadcasts you. The most useful thing you could be. The saddest ending.
3. **The Ocean Barks.** Holes very high (nearly every rippable Law). ZOOM, riddled with holes, starts acting like you: it climbs, rips, throws and hides. In the last chase you hide from a colossal chihuahua.

---

## 8. Twenty-minute vertical slice (Contact wing)

One wing, three Scars, one chase. **Target: a stranger with no tutorial text can complete it in 15-25 minutes and want more.**

| Time | Beat | What the player does | What it teaches |
|---|---|---|---|
| **0:00-0:40** | **Wake in the spit-pool.** No UI. A far-off thump. | Run, jump. | Movement. The dog is small and fast. |
| **0:40-2:00** | **Room A: Mouth of Static.** A slack tongue-bridge sags over black. | Climb tastebud handholds up the tongue. | Grip and release. Breathing surfaces. |
| **2:00-3:30** | **The clenched door.** A door shut like a jaw, glowing seam at chest height. | **Rip WON'T CLOSE.** The door yawns open. Thump: first flinch. | Rip is a two-beat heist. |
| **3:30-5:00** | **The peristaltic gate.** A throat-gate clamps on rhythm; mites swarm out. | **Jam** WON'T CLOSE into the gate. It stays open. Run through. | Carry, jam, consume. |
| **4:30** | **Scar 1: The Socket.** A tooth-socket by the gate, forced by a warden's sniff and a small gravity nudge. | Duck in and hold Y. Notice drops. | Hide works. Boredom is audible. |
| **5:00-7:30** | **Room B: First Rib.** A breathing arch, vertical. Hold on exhale, lunge on inhale. | Climb. Mites gnaw at the ledges. | Rhythmic climbing under threat. |
| **7:30-9:00** | **The molar-row.** Sleeping mouths on the rib's crest. Optional side ledge. | **Rip TEETH.** Optionally **throw** TEETH behind you to block mites. | Rip #2. Throw makes a consequence. |
| **8:00** | **The first Menu.** A glowing arrow labeled "THIS WAY (USEFUL)". | Follow it and land in a pit with Notice up one tier. Or bite it. | Menus are bait. |
| **9:00-11:00** | **Scar 2: Under the Rib.** Slide down the rib's underside. Blood-warm and safe. | Stash TEETH here, or carry it. | Scars stash Laws. |
| **11:00-13:00** | **Room C: Window Hall.** Walls go transparent the wrong way. The Panes watch. | Move behind mass. Stand still when a Pane sweeps. | Watchers punish moving in the open. |
| **13:00-15:30** | **The Pane frame.** A framed pane at the hall's heart. It's a piece of ZOOM's eye. | **Rip LOOKS THROUGH YOU.** This is the third theft. It's *loud*: Notice max. | The climax rip. |
| **15:30-19:00** | **CHASE: "I LOOKED."** The eye opens. See below. | Survive. | Chase rules. |
| **19:00-20:00** | **Coda.** You crawl out of Scar 3 into black, holding two Laws. The ocean mutters your footsteps. | Walk. | It's not over. |

### The chase: "I LOOKED" (~3 minutes)

| Time | Event |
|---|---|
| 0:00 | Eye opens on the horizon. Cone sweeps. You break for the nearest hanging curtains. |
| 0:15 | First footprint-teeth. You learn not to run straight. |
| 0:30 | **Gravity rolls.** The hall tips 90°. The window-panes are floors. |
| 0:50 | ZOOM re-aims one Law you embedded: the WON'T CLOSE gate behind you inhales like a throat, dragging loose debris toward the eye. |
| 1:10 | A floor pickup glows: **STATIC.** Not ripped, just lying there like a mistake. |
| 1:30 | **Scar 3 is inside a sealed molar.** Look through LOOKS THROUGH YOU to see which molar is hollow. All the teeth look the same. |
| 1:50 | Enamel is sealed. Throw TEETH to bite it open. If you spent TEETH already, the eye's sweep cracks a molar for you: ZOOM breaks its own house trying to hit you. |
| 2:10 | Blind the eye: throw STATIC at it. |
| 2:20 | Dive into Scar 3. Hold Y. |
| 2:40 | The eye drifts, lids droop, and the organ sags. Chase over. |

**What the slice must prove (playtest gates):**
1. A stranger rips the first Law within 3 minutes with no text.
2. A stranger *uses* the second Law on their own initiative.
3. Someone smashes the first Menu because it annoys them.
4. In the chase, people invent a plan you didn't plan for. (Teeth on a footprint, offering a Law, luring a Pane.)
5. When the chase ends, they say "again."

If (1) fails, fix the geometry, not the text. If (5) fails, the chase is either too easy or too long.

---

## 9. Eight to twelve hours without a walking sim

**The rule:** *no 30 seconds without a verb.* Every screen has at least one rip, one throw target and one hiding spot, or it gets cut.

**Escalation by twist, not by menu.** Each wing changes what a Law *is* (worn in Appetite, weapon in Zoo, a live thing in Interference, contested in The Show). The verbs stay the same and the meaning changes.

**Scale of chase grows.** Contact's chase is 3 minutes through one room. Appetite's is a stomach digesting you while it hunts. Zoo's chase is the whole exhibit closing its gates. Interference's is a signal that jumps between rooms with you. The Show's is the ocean *acting* out a chihuahua chasing you.

**The chase reuses your own placements.** What you built earlier becomes the terrain of your next flight. You are always fighting your own work.

**Two ways to play.** Greedy (rip everything, live in Stare, master chases) and patient (hide and pick your Laws, live in Asleep). Both have paths. Both change the ending.

**Menu pressure.** The Menu bait gets sneakier: fake waypoints, fake ladders, fake friends. Each is a small test of impulse.

**New Game+.** ZOOM plays your last run's Laws back at you in the wrong organs. Your old rips become its reflexes.

**Cuts, always.** No lore rooms. No fetch quests. No cathedral tourism. No cutscene longer than the chase before it. If a space has no rip, no throw target and no hide, it goes.

---

## 10. First prototype (two weeks, one person)

1. **Days 1-3:** grey-box the climb. A dog on a sagging tongue with 20 handholds. If climbing isn't fun here, stop.
2. **Days 4-6:** rip + carry. One clenched door, one Law, one gate. Hit-stop and controller lurch first, art last.
3. **Days 7-9:** throw + jam. Three surfaces that change visibly when a Law lands.
4. **Days 10-12:** Notice + one Scar. Three tiers, diegetic tells only. Hiding lowers it.
5. **Days 13-14:** one chase. The eye, footprint teeth, one gravity roll. Cut anything that isn't fun.

**Definition of fun:** a first-time player laughs, then swears, then tries it again.

---

*The show must go on. The dog is small. The ocean is bored. That's all the plot there is.*

---

## Appendix: what Appetite turned into

Design notes from building Wing Two, where the prototype differs from the wing table in §7.

- **Wearing** is a second slot, not a replacement for carrying. You have a mouth, a haul, and a worn Law.
  THREE HEARTS is the exception: it grows in and has its own place (three pips), so you can wear a mask *and* hearts.
- **The clock is acid, not the room.** A rising lake (or a fixed pool) instead of a digesting building. It is
  Notice-scaled (greed speeds it) and boredom-scaled (hiding in a Scar makes it ebb), which is the same
  Greed/Boredom loop as Contact turned into terrain.
- **Boredom has a target.** GETS BORED thrown at the acid drains it for 14 s. That is the whole Law in one gesture.
- **Maws eat what you carry.** It made Appetite about *appetite*: the danger is not damage, it is losing the chunk
  in your mouth.
- **LEAVES THE MEETING worn is the panic button** from the doc: press V again and you are back at your last Scar,
  minus the Law. It is the only worn Law that costs itself.
- **The finale is a clench, not a boss.** Ripping the second sign arms the stomach; being swallowed disarms it,
  and it re-arms when you head back for the balconies. Scar 4 (Hollow Balcony) is mid-climb on purpose: hide there
  until Notice drops under Stare and the flood ebbs.
- **Nothing strands you.** If a required Law is gone from the world, ZOOM grows another vein for it.

## Appendix: what the Zoo turned into

- **Menus stopped being a tutorial gag and became the enemy class.** Docents (the old drifting Menu, now in crowds), turnstiles,
  placards and CLOSED signs are all Menu-shaped, so one Law, SMASHES MENUS, answers all of them. Thrown at a docent it does the
  thing the doc promised: the Menu it touches turns on the other Menus.
- **Leash is a price you can pay.** A gate opens for anyone with a Menu on their back. That is the cheap route through the Ticket Hall
  and it costs a tally that the ending will read. Biting is the slow route and smashing the loud one.
- **OWNS THE ROOM became a decoy.** "A tiny object becomes the boss of the space" turned out to mean: everything that was looking at you
  looks at the pebble. It works on docents, placards and the cursor, which makes it the answer to the finale.
- **The chase is the cursor.** ZOOM's attention at colossus scale in a wing about interfaces is a mouse pointer: a telegraphed ring,
  a click 0.45 s after it stops following you, then a busy wheel. You never damage it; you keep moving, hide, or give it something else to click.
- **Closing time is a clock made of shutters** in the same family as Appetite's acid: greed makes it worse (Stare grows teeth in the floor),
  a Scar right before it lets you cool off, and being removed by the zoo is the same as being swallowed.
