// Move registry (plan §4.1). Seeded with the Ch.1-era moves; roster cards
// extend this. Names must fit the battle menu (≤10 chars, linted); descs
// are the UX2.2 hover line — one 18-glyph help-bar line, linted too.
import type { MoveDef, MoveId } from '../types';

export const MOVES: Record<MoveId, MoveDef> = {
  tackle:  { id: 'tackle',  name: 'TACKLE',  type: 'NORMAL',   power: 35, acc: 0.95, anim: 'lunge', desc: 'A PLAIN BODY SLAM.' },
  screech: { id: 'screech', name: 'SCREECH', type: 'NORMAL',   power: 25, acc: 0.9,  anim: 'rings', desc: 'AN AWFUL SHRIEK.' },
  smog:    { id: 'smog',    name: 'SMOG',    type: 'POISON',   power: 20, acc: 0.9,  anim: 'gas',   desc: 'A CHOKING CLOUD.' },
  sludge:  { id: 'sludge',  name: 'SLUDGE',  type: 'POISON',   power: 65, acc: 0.85, anim: 'lob',   desc: 'FLUNG TOXIC MUCK.' },
  zap:     { id: 'zap',     name: 'ZAP',     type: 'ELECTRIC', power: 40, acc: 1,    anim: 'bolt',  desc: 'A QUICK JOLT.' },
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
  sting:   { id: 'sting',   name: 'PSN STING',type: 'POISON',  power: 35, acc: 0.95, anim: 'lob',   desc: 'A VENOMOUS JAB.' },
};
