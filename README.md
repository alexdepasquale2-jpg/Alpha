# Loopwright

**The crochet studio: plan, create, post, share, build, imagine.**

Loopwright is a web app for people who crochet seriously. It keeps your projects,
patterns, stash and ideas in one place. It reads your written patterns and checks
every stitch count. It follows along row by row (or stitch by stitch) while your hands
are busy, and it hands your work to other people as a link, a QR code, a share image or a
printable PDF.

It is local-first: everything you make lives in your browser on your own device. The
small server that ships with it adds a shared community board and short share codes for
everyone who uses the same server (a guild, a class, a market stall, a group of friends
on the same wifi).

Vanilla JavaScript, no build step and no runtime dependencies. The server is a single
standard-library Python file.

---

## Running it

```sh
python3 server.py
```

Open the printed address. `localhost` works on the same machine; the "same wifi" address
works on a phone. Add it to your home screen and it runs full screen and works offline.

```sh
python3 server.py --port 9000 --data-dir /var/loopwright
```

Python 3.10+. Nothing to install. Community posts, photos and share codes are written
to `data/` (or `--data-dir`); everything else stays in each person's browser.

Running a board for a guild or class? Start it with a moderator key:

```sh
python3 server.py --moderator-key "something-long-and-secret"
```

Anyone who enters that key in Settings can remove any post or comment. Everyone else
can still hide a post on their own device.

The app also works from any static host (GitHub Pages, a USB stick behind
`python3 -m http.server`). Without the Loopwright server, the community board is
switched off and shares use self-contained links instead of short codes.

### As a claude.ai artifact

`artifact/loopwright.html` is the page for publishing Loopwright as a claude.ai
artifact, with `web/` as the root for its supporting files (`css/app.css`, `js/**`,
`icon.svg`). It marks itself with `data-host="artifact"`, and the app adapts to the
artifact frame (`web/js/core/host.js`):

- There's no community board. Posts go to the journal.
- Patterns, charts and palettes are shared as share codes to paste into Share → Open a
  share, not as links.
- Downloads open a sheet to copy the text or save the image, and backups can be pasted
  back in.
- Printing, voice commands, Web Share and installing are hidden.

Everything saves in each viewer's own browser.

## What's in it

**Studio.** Today at a glance: the project to pick back up, hours this week, stash
size, deadlines, a stitch of the day.

**Plan**
- A project board (Ideas, Queued, In progress, Finished, Frogged) with drag and drop
  on desktop. Each project has its pattern, hook, yarn pulled from your stash, recipient,
  due date, photos, notes, logged time, and a cost-and-price card.
- Finishing a project offers to subtract the yarn it used from your stash.
- A yarn stash with weight, fiber, yardage, dye lot, price and storage location.
  Filter by weight and color family. "Match a color" finds the closest yarn you own.
- Hooks (metric, US and old UK sizes, steel hooks) and notions.
- People you make for: measurements (head, chest, foot…), favorite colors, fibers to
  avoid, birthdays with reminders, and everything you've made them. The hat generator
  sizes straight from their head measurement.
- Sales: put finished pieces up for sale at a suggested price (materials, your time,
  overhead, markup), sell them with one tap on market day, and see revenue, profit,
  sales by channel and what your time actually earned.
- Calculators: gauge check with a hook suggestion, size to stitches with stitch
  multiples and starting chain, even increases and decreases, yardage from a weighed
  swatch, quick yardage by size and stitch, yarn substitution, yarn weight from wraps
  per inch or label yardage, pricing, plus hook, yarn-weight and standard-size tables.
- A shopping list that suggests what your queued projects need beyond your stash.

**Create**
- A pattern editor with a live stitch-count checker (see below), parts that can be
  made several times ("Arms, make 2"), US/UK conversion, and an abbreviation list built
  from the stitches the pattern actually uses.
- Graded patterns: name your sizes and write numbers as `sc 20 (24, 28)`. Every size
  is checked on its own, a project follows just its size, and you can print all sizes
  or one.
- Tech-editing tools: renumber rows after inserting some, and write in the stitch
  count on every row that's missing one. Version history keeps the pattern as it was
  before each editing session, restorable in one tap.
- Symbol diagrams drawn from the written instructions, in the round or flat.
- A formatted preview that prints or saves as PDF, with checkboxes for every row.
- Paste a pattern in and it's split into parts, its terms are detected, and every count
  is checked.
- A colorwork chart designer: pencil, fill, line, rectangle, mirror, undo. It writes
  tapestry (flat or in the round) and corner-to-corner instructions with yarn per color,
  bobbin counts and finished size. **Photo to chart** picks colors (or snaps to your stash
  yarn), optionally dithers, and cleans up single-stitch "confetti". Charts export as a
  numbered image with a color key, or print together with their instructions. A text
  tool stamps names and dates in a pixel font, for C2C name blankets.
- An amigurumi shape builder: ball, egg, oval, tube, cone, or a freeform silhouette you
  drag into shape. It writes the rounds for your gauge with staggered increases, estimates
  yarn and stuffing, and saves them as a pattern.
- A stitch dictionary: 30 stitches with standard symbols, US and UK names, step-by-step
  instructions and tips, plus classic stitch patterns with their multiples and the core
  stitch names in Spanish, French, German, Dutch, Italian and Portuguese for reading
  patterns from abroad.

**Post.** A community board for everyone on the server: photos, hashtags, likes,
comments, and attached patterns or charts that others can save with one tap. There
are no accounts. You pick a display name, and only the device that posted something
can delete it. Everything also goes to a private journal on your device, which works
with no server at all.

**Share.** Short share codes (with the server) or self-contained links (without it: the
pattern is compressed into the link and never uploaded). Every share also gets a
QR code to show on your phone, a 1080×1350 share image for social media, a file, and for
patterns a print/PDF version. Also here: full backup and restore, including photos.

**Build.** A tracker built for hands full of yarn. Row by row or stitch by stitch
("inc: 2 sc in the next stitch, 13 of 24"), with a repeat counter for bracketed
repeats, notes that pop up at the right row (the pattern's and your own), and a
celebration when a part is done. It measures your real stitches per minute as you go
and offers to use that for time estimates.
Counters can follow the rows or count up to a number and roll over. There's a session
timer (it notices if you walked away and left it running), keep-screen-on, vibration,
and voice commands ("next", "back", "pause"). Charts can be followed row by row too,
color by color. There's also a plain counter when you don't need a pattern.

**Search.** Ctrl/⌘+K (or `/`) searches projects, patterns, charts, yarn, people and
stitches, and jumps to any tool.

**Imagine**
- A palette studio: harmonies, shuffle and lock, colors pulled from a photo, a palette
  built only from yarn you own, a grey value check for colorwork, warnings for colors too
  close to tell apart, previews, and the closest stash yarn for each color.
- Generators that write patterns the checker accepts: granny squares with a scrappy
  blanket planner (no two neighbouring squares match) and yarn per color; stripe
  sequences (even, Fibonacci, random, gradient, mirrored); top-down hats for any head
  and gauge, with a ribbed or plain brim.
- An idea spinner and a few challenges for when you don't know what to make next.

## The stitch-count checker

The checker reads standard written crochet the way people actually write it:

```
Rnd 1: 6 sc in MR (6)
Rnd 2: inc x6 (12)
Rnd 3: (sc, inc) x6 (18)
Rnd 4: *sc 2, inc; rep from * around [24]
Rnds 5-9: sc around (24)
R3: 1 sc, inc x 6 (18)             ← understood as (sc, inc) x6
Row 1: sc in 2nd ch from hook and in each ch across (19)
Row 2: ch 3 (counts as dc), dc in each st across (19)
Rnd 2: ch 3 (counts as dc), (2 dc, ch 2, 3 dc) in same sp, *ch 1, (3 dc, ch 2, 3 dc) in next ch-2 sp; rep from * 2 more times, ch 1, join (24 dc)
```

For every row it works out how many stitches are used from the row below and how many
are left for the next row, then compares that with the count in brackets. That count
can be a number, a number with a stitch ("(36 dc)", where chains don't count) or an
itemised total ("(12 dc, 4 ch-2 sps)"). It understands increases and decreases,
`Ntog`, post stitches, clusters worked into one stitch, turning chains that do and don't
count, skips, slip-stitch joins and moves, magic rings, "around", "across", "to last
2 sts", both kinds of star repeat, row ranges, back and front loops, and UK terms.

When notation is ambiguous it tries the other sensible readings before calling
something a mistake. "Rep from * 5 times" can mean five in total or five more, and
"sc, inc x6" usually means the whole round six times. It never raises a hard error on
a line it couldn't fully read; those get a gentle note instead. The generators, the
even-increase calculator and the sample content are all tested against it.

## Your data

Projects, patterns, charts, stash, palettes, journal and photos are stored in the
browser's IndexedDB on your device. The server only ever holds what you choose to post
to the community board or share with a short code. Backups are plain JSON files you
can keep anywhere. The app asks the browser to protect its storage from automatic
clean-up if you press "Protect storage" in Share.

The server has no accounts. Deletion rights are secret tokens held by the posting
device (stored hashed on the server), plus an optional moderator key; device ids are hashed before they're
published, uploads are checked against their real file type, every write is
rate-limited, and pages are served with a strict Content Security Policy.

## Development

```sh
npm install        # only needed for the browser test (Playwright)
npm test           # parser, calculators, generators, charts, colors, QR (node) + server API (python)
npm run test:browser   # end-to-end: real server, real Chromium, every section, phone layout
```

`npm test` needs nothing installed. The browser test uses Playwright; set
`PLAYWRIGHT_BROWSERS_PATH` if your Chromium lives somewhere other than Playwright's
default.

```
server.py              community board, share codes, photo uploads, static files
web/index.html         the app shell
web/css/app.css        the design system (light and dark)
web/js/main.js         boot, navigation, routing
web/js/core/           DOM helpers, IndexedDB store, router, API client, share links, QR codes
web/js/crochet/        the craft: stitch dictionary, pattern checker, US/UK terms, calculators,
                       generators, symbol diagrams, colorwork charts, color science
web/js/views/          one module per section
tests/                 logic.test.mjs, test_server.py, smoke.test.mjs
```

Estimates (yardage, time, finished size) are honest ballparks, usually within about
20%. Weigh a swatch for the real number, and set your tension and speed in Settings.
