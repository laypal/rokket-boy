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
- **Chapter 1: the HQ heist.** The opening job, the HQ hub, the first
  guards, the first battle.
- **Mons and battles.** A mon model with nine types and a 9×9 chart, XP
  and levelling, move learning, evolution with a cinematic, party
  management, SWIPE (the catch mechanic), items in battle, whiteout, per-
  move battle animations and hit feel.
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
- **Chapter 2: Mt. Möön.** Cave maps, wild encounters, a dig sequence,
  new species.
- **Side content so far.** The HQ job board (seeded contracts) and HQ
  training drills (a sparring bout and a stealth course, both safe to
  fail).
- **Hardening.** Crash guard with a visible error line, security headers
  and a hash-pinned CSP on the served page, CI as a gate, data and
  content lints, a 400 KB single-file ceiling.

## What's next, roughly in order

1. **A dex-style mon detail screen** in the pause menu.
2. **Chapter 3: Nugget Span.**
3. **Chapters 4 and 5:** the S.S. Ann and Lavendar Tower.
4. **Chapters 6 and 7:** Sylphco Tower (a two-part job) and the Kantoo
   Power Plant.
5. **Chapters 8 and 9:** Safari Zoon, which carries the game's moral
   branch, and Cindabar Lab. The rest of the species roster and eggs land
   alongside these.
6. **Chapter 10: Viridiun Gym**, the finale, with endings and a balance
   pass.
7. **QA hardening** before calling it done: a balance harness, touch
   controls, performance.

## Also planned, slotted in where they fit

- More side content: a casino, eggs and a dex egg, hidden items, level
  candy.
- Field skills (SMASH / DIG / SURF / FLY), a move tutor and a black
  market, all design-first.
- Minigames (a grabber gallery, a bike race), gated on the audio budget.
- The remaining species and their evolutions.
- More music, within the single-file size ceiling.

## How to read this

If something you care about is missing or in the wrong order, open an
issue and say why. I'd rather argue about the order in public than guess.
