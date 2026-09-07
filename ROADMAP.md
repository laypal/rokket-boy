# Roadmap

The high-level view of what's in the game and what I plan to add. The
detailed planning (card decks, specs, playtest notes) lives in my private
working repo; this file is the public summary and I update it when a
milestone lands. Treat the order as intent: this is a hobby project
worked in short sessions, and playtests reshuffle it more often than I'd
like.

## What's shipped

- **The engine.** 160×144 canvas renderer, four-channel chiptune
  sequencer, sprite frames, keyboard + on-screen buttons, seeded RNG, a
  script interpreter that runs all dialogue and cutscenes from data.
- **Chapters 1 to 6.** The HQ heist; Mt. Möön (caves, wild encounters, a
  dig); Nugget Span (a prize bridge that isn't); the S.S. Ann (a
  disguise and a five-minute clock); Lavendar Tower (fog you can't see
  past, a ghost you can't beat, and a cat who talks back); Sylphco Tower
  (card-key doors, lift pads, and a boss fight that is really two).
- **Mons and battles.** A mon model with nine types and a 9×9 chart, XP
  and levelling, move learning, evolution with a cinematic, party
  management, SWIPE (the catch mechanic), items in battle, whiteout, per-
  move battle animations and hit feel, a mon detail page in the PARTY
  screen. In August I redrew most of the roster's front and back sprites,
  and kept the few originals that still read better.
- **HEAT.** The alarm system: guards with sight cones, a heat meter that
  climbs and decays, lockdown, chases with a leash, and a shared whiteout
  penalty when it all goes wrong.
- **Items, shops, MON LOCKER, saves.** A typed item registry, vendors,
  the HQ locker terminal, versioned localStorage saves with autosave and
  CONTINUE.
- **Quests, ranks and rewards.** A quest log, a rank ladder you climb by
  doing jobs, per-rank rewards (coins and gear), a BACK ROOM gear vendor,
  worn gear that shows on your sprite and gives perks (steal, job payout,
  shop discount) with per-surface caps.
- **Onboarding.** A cold-open cinematic with its own score, Myowth's
  guided tour of HQ, a coached first spar, and markers over whoever you
  need to talk to next.
- **Side content.** The HQ job board (seeded contracts), training drills
  (a sparring bout and a stealth course, both safe to fail), the DEALER's
  PICKPOCKET card table, map eggs and a GRUNTDEX clerk, hidden pickups,
  and LEVEL CANDY.
- **Sound.** Thirteen tracks across the chapters, and every sound effect
  is data now, with a script that renders any of them to WAV so I can
  hear a sound before it ships.
- **Distribution.** You can install it as a phone app and play it
  offline. The title screen shows which commit it is. After every deploy
  a workflow checks the live site is serving the pushed commit and tags
  it, and I have a written rollback path for when it isn't.
- **Hardening.** Crash guard with a visible error line, security headers
  and a hash-pinned CSP on the served page, gzip, CI as a gate, data and
  content lints, a 400 KB single-file ceiling.
- **Overworld juice, started.** The world now has its own small
  animation layer (a draw-only effect over any tile, driven from scripts
  or the engine). The first card is in. The effects that use it are next.

## What's next, roughly in order

1. **Overworld juice.** A catalogued set of sound effects, a heal
   sparkle at the bunk and the heal pad, guard alerts that pop and shake
   the screen, a flash on lift pads and chests, and a smoke puff when
   someone leaves the scene.
2. **Chapter 7: the Kantoo Power Plant**, the alarm system's showcase
   chapter, with four new species.
3. **Chapters 8 and 9:** Safari Zoon, which carries the game's moral
   branch, and Cindabar Lab. The rest of the species roster and eggs land
   alongside these.
4. **Chapter 10: Viridiun Gym**, the finale, with endings and a balance
   pass.
5. **QA hardening** before calling it done: a balance harness, a
   full-campaign Playwright run, a touch-device and short-screen pass,
   and a performance audit.

## Also planned, slotted in where they fit

- Field skills (SMASH / DIG / SURF / FLY), a move tutor and a black
  market, all design-first.
- Minigames (a grabber gallery, a bike race), gated on the audio budget.
- The remaining species and their evolutions.
- More music, within the single-file size ceiling.

## How to read this

If something you care about is missing or in the wrong order, open an
issue and say why. I'd rather argue about the order in public than guess.
