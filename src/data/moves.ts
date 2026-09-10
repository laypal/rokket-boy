// Move registry (plan §4.1). Seeded with the Ch.1-era moves; roster cards
// extend this. Names must fit the battle menu (≤10 chars, linted); descs
// are the UX2.2 hover line — one 18-glyph help-bar line, linted too.
import type { MoveDef, MoveId } from '../types';

export const MOVES: Record<MoveId, MoveDef> = {
  tackle:  { id: 'tackle',  name: 'TACKLE',  type: 'NORMAL',   power: 35, acc: 0.95, anim: 'lunge', desc: 'A PLAIN BODY SLAM.' },
  screech: { id: 'screech', name: 'SCREECH', type: 'NORMAL',   power: 25, acc: 0.9,  anim: 'rings', desc: 'AN AWFUL SHRIEK.' },
  // F43 STA.0 (PLAN A7): smog/sting/zap gain a status chance; hypno is new
  // and status-only (power 0). thunder/boom/sludge stay plain — three PAR
  // sources in one chapter would make CH7 a coin flip.
  smog:    { id: 'smog',    name: 'SMOG',    type: 'POISON',   power: 20, acc: 0.9,  anim: 'gas',   desc: 'A CHOKING CLOUD.', status: { id: 'PSN', chance: 0.3 } },
  sludge:  { id: 'sludge',  name: 'SLUDGE',  type: 'POISON',   power: 65, acc: 0.85, anim: 'lob',   desc: 'FLUNG TOXIC MUCK.', status: { id: 'PSN', chance: 0.3 } }, // F43-FB A7
  zap:     { id: 'zap',     name: 'ZAP',     type: 'ELECTRIC', power: 40, acc: 1,    anim: 'bolt',  desc: 'A QUICK JOLT.', status: { id: 'PAR', chance: 0.3 } },
  boom:    { id: 'boom',    name: 'BOOM',    type: 'ELECTRIC', power: 90, acc: 0.75, anim: 'blast', desc: 'A WILD DISCHARGE.' },
  // SPR.A — RATIKATT/RATIKATE and ZUBATT/GOLBATT learnsets.
  bite:    { id: 'bite',    name: 'BITE',    type: 'NORMAL',   power: 45, acc: 0.9,  anim: 'lunge', desc: 'A MEAN LITTLE NIP.' },
  chomp:   { id: 'chomp',   name: 'CHOMP',   type: 'NORMAL',   power: 70, acc: 0.85, anim: 'lunge', desc: 'JAWS CLAMP DOWN.' },
  gust:    { id: 'gust',    name: 'GUST',    type: 'NORMAL',   power: 40, acc: 0.95, anim: 'rings', desc: 'A BATTERING WIND.' },
  drain:   { id: 'drain',   name: 'DRAIN',   type: 'POISON',   power: 35, acc: 0.9,  anim: 'gas', effect: 'drain', desc: 'STEALS SOME HP.' },
  // SPR.B — GEODOOD/GRAVLR and EKANZZ/ARBÖK learnsets.
  rocks:   { id: 'rocks',   name: 'ROCKTHROW',type: 'GROUND',  power: 50, acc: 0.85, anim: 'lob',   desc: 'ROCKS THROWN HARD.' },
  rumble:  { id: 'rumble',  name: 'RUMBLE',  type: 'GROUND',   power: 75, acc: 0.8,  anim: 'blast', desc: 'THE GROUND HEAVES.' },
  wrap:    { id: 'wrap',    name: 'WRAP',    type: 'NORMAL',   power: 25, acc: 0.9,  anim: 'rings', desc: 'A CRUSHING COIL.' },
  sting:   { id: 'sting',   name: 'PSN STING',type: 'POISON',  power: 35, acc: 0.95, anim: 'lob',   desc: 'A VENOMOUS JAB.', status: { id: 'PSN', chance: 0.3 } },
  // SPR.C — WHEEZINK/GASTLEE/HAUNTOR/MYOWTH/MAROWL learnsets (CH5).
  lick:      { id: 'lick',      name: 'LICK',      type: 'GHOST',  power: 30, acc: 1,    anim: 'lunge', desc: 'A COLD, WET LICK.' },
  spook:     { id: 'spook',     name: 'SPOOK',     type: 'GHOST',  power: 50, acc: 0.9,  anim: 'rings', desc: 'A CHILLING SHRIEK.' },
  shade:     { id: 'shade',     name: 'SHADE',     type: 'GHOST',  power: 70, acc: 0.85, anim: 'gas',   desc: 'SHADOWS SWALLOW.' },
  boneclub:  { id: 'boneclub',  name: 'BONE CLUB', type: 'GROUND', power: 65, acc: 0.85, anim: 'lob',   desc: 'A THROWN OLD BONE.' },
  payday:    { id: 'payday',    name: 'PAY DAY',   type: 'NORMAL', power: 40, acc: 1,    anim: 'lob',   desc: 'COINS FLY. YOURS.' },
  // SPR.D / CH6 — the first PSYCHIC and FIGHTING moves (DROWZEY/HYPNÖZ,
  // MACHOPP/MACHÖKE lines). Existing FxIds only; DREAM EAT drains like DRAIN.
  confuse:   { id: 'confuse',   name: 'CONFUSION', type: 'PSYCHIC',  power: 50, acc: 1,    anim: 'rings', desc: 'A DIZZYING PULSE.' },
  psybeam:   { id: 'psybeam',   name: 'PSYBEAM',   type: 'PSYCHIC',  power: 65, acc: 0.9,  anim: 'bolt',  desc: 'BENDS THE MIND.' },
  dreameat:  { id: 'dreameat',  name: 'DREAM EAT', type: 'PSYCHIC',  power: 70, acc: 0.9,  anim: 'gas',   desc: 'EATS YOUR DREAMS.', effect: 'drain' },
  hypno:     { id: 'hypno',     name: 'HYPNO',     type: 'PSYCHIC',  power: 0,  acc: 0.7,  anim: 'rings', desc: 'PUTS IT TO SLEEP.', status: { id: 'SLP', chance: 1 } },
  lowkick:   { id: 'lowkick',   name: 'LOW KICK',  type: 'FIGHTING', power: 45, acc: 0.95, anim: 'lunge', desc: 'SWEEPS THE LEGS.' },
  karate:    { id: 'karate',    name: 'KARATE',    type: 'FIGHTING', power: 50, acc: 1,    anim: 'lunge', desc: 'A FLAT-HAND CHOP.' },
  submit:    { id: 'submit',    name: 'VICE GRIP', type: 'FIGHTING', power: 80, acc: 0.8,  anim: 'blast', desc: 'A CRUSHING HOLD.' },
  // CH7.0 §10 (SPR.E) — MAGNEMYT/MAGNETUN/ELECTRÖD/VOLTRAWK line.
  magnet:  { id: 'magnet',  name: 'MAGNET',  type: 'ELECTRIC', power: 55,  acc: 0.95, anim: 'rings', desc: 'PULLS WITH FORCE.' },
  thunder: { id: 'thunder', name: 'THUNDER', type: 'ELECTRIC', power: 110, acc: 0.7,  anim: 'blast', desc: 'THE SKY FALLS.', status: { id: 'PAR', chance: 0.2 } }, // F43-FB A7
};
