// ROKKET HQ B1F — dialogue & interaction scripts (ported from npcDialog/interact v2).
import type { ScriptStep } from '../../types';

export const hqScripts: Record<string, ScriptStep[]> = {
  // CH2.4/CH3.3: outermost branches first — ch3Done afterglow, then the
  // ch3 briefing (replacing the old ch2Done afterglow line, the same way
  // CH2.4 replaced ch1's "rest up" slot), then the untouched ch2/ch1 chain.
  // KIRA runs the span and promotes the player herself (span_kira's onWin),
  // so there is no CH3 hand-in branch here — just the briefing and the
  // afterglow that bookend it.
  'npc:giovanni': [
    {
      if: { flag: 'ch3Done' },
      then: [
        { say: [['GIOVANNI: KIRA', 'says you passed.', 'Do not gloat.'], ['OPERATIVE suits', 'you. For now.']] },
      ],
      else: [
        {
          if: { flag: 'ch2Done' },
          then: [
            { say: [['GIOVANNI: AGENT.', 'A new racket.', 'The NUGGET SPAN.'], ['East of MT. MOON.', 'We run a "prize', 'bridge" there.'], ['Five marks paid', 'to cross. Beat', 'them. Keep it.'], ['AGENT KIRA runs', 'the span. Do as', 'she says.']] },
          ],
          else: [
            {
              if: { flag: 'bradBeaten' },
              then: [
                {
                  say: [
                    ['GIOVANNI: The', 'pair of fossils.', 'Intact. Good.'],
                    ['And you dented', "BRAD's ego on", 'the way. Better.'],
                  ],
                },
                { setFlag: 'ch2Done' },
                { music: 'victory' },
                { rankUp: true },
                { endScreen: true },
              ],
              else: [
                {
                  if: { flag: 'missionDone' },
                  then: [
                    {
                      say: [
                        ['GIOVANNI: New', 'job. A dig site', 'in MT. MOON.'],
                        ['Cave mouth is', 'east of the', 'GAMEZ CORNER.'],
                        ['Scientists dug', 'up a PAIR of', 'fossils. Fetch.'],
                      ],
                    },
                  ],
                  else: [
                    {
                      if: { flag: 'lootTaken' },
                      then: [
                        { say: [['GIOVANNI:', 'Well? Hand it', 'over already!']] },
                        { setFlag: 'missionDone' },
                        { music: 'victory' },
                        { endScreen: true },
                      ],
                      else: [
                        {
                          if: { flag: 'briefed' },
                          then: [{ say: [['GIOVANNI:', 'The vault, grunt.', 'Why are you here?']] }],
                          else: [
                            { setFlag: 'briefed' },
                            {
                              say: [
                                ['GIOVANNI:', 'So. The new', 'grunt.'],
                                ['Listen well. The', 'GAMEZ CORNER', 'upstairs hides'],
                                ['our old vault.', 'A CASE OF COINS', 'was left inside.'],
                                ['A guard blocks', 'the way. Deal', 'with him.'],
                                ['Find the switch.', 'Take the case.', 'Do NOT fail me.'],
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  // SIDE.5 (re-cut 2026-08-15 after Lyall's playtest): the sparring drill is
  // available from the FIRST talk — training must land BEFORE the guard
  // fight, that's the whole point. Her story line plays first (pre-brief,
  // mid-heist, post-heist), then she OFFERS the spar behind a YES/NO. Once
  // drillBattleDone is set the offer softens to "another round?" — the
  // fight never fires again unless the player says YES on purpose (v1
  // looped it on every talk).
  'npc:jessika': [
    {
      if: { notFlag: 'briefed' },
      then: [{ say: [['JESSIKA: The boss', 'is waiting, new', 'kid. Look sharp!']] }],
      else: [
        {
          if: { flag: 'missionDone' },
          then: [
            { addEgg: 'motto' },
            { say: [['JESSIKA: A case', 'of coins?! And', 'we get NOTHING?!']] },
          ],
          else: [
            {
              say: [
                ['JESSIKA: Prepare', 'for trouble!'],
                ['...What? I say', 'that to every-', 'one. Move along.'],
              ],
            },
          ],
        },
      ],
    },
    {
      if: { notFlag: 'drillBattleDone' },
      then: [
        {
          choice: {
            say: [['Fancy a sparring', 'drill first? Free', 'lesson, no risk.'], ['Spar with me?']],
            yes: [{ say: [['Rule one:', 'no mercy!']] }, { battle: 'spar_jessika' }],
            no: [{ say: [['JESSIKA: Suit', "yourself. I'm", 'here if you want.']] }],
          },
        },
      ],
      else: [
        {
          choice: {
            say: [['Another round,', 'champ? No coins', 'this time.'], ['Spar again?']],
            yes: [{ battle: 'spar_jessika' }],
            no: [{ say: [['JESSIKA: Go get', "'em, then."]] }],
          },
        },
      ],
    },
  ],
  'npc:djames': [
    {
      if: { flag: 'briefed' },
      then: [
        {
          say: [
            ['DJAMES: And make', 'it double!'],
            ['The GAMEZ CORNER', 'guard hates', 'losing. Heh heh.'],
          ],
        },
      ],
      // v2 slice(0,3) dropped the 4th line; kept verbatim
      else: [{ say: [['DJAMES: Ooh, a', 'new grunt! The', 'boss will brief']] }],
    },
  ],
  'npc:vendor': [
    { say: [['Psst... need', 'gear for the', 'job? I gotcha.']] },
    { shop: 'hqStall' },
  ],
  // RNK.3: the BACK ROOM gear vendor. Stock is rank-gated in shops.ts —
  // this dialogue names no rank or condition, only the sales pitch (the
  // RNK.2 disclosure ruling: rewards on show, conditions never).
  'npc:blackmarket': [
    {
      say: [
        ['Back room deals.', 'Rank has its', 'perks, grunt.'],
        ['The higher you', 'rank, the more', 'I got for you.'],
      ],
    },
    { shop: 'blackMarket' },
  ],
  // QOL.9: the base "pokecentre" — free full heal + revive, no coin cost,
  // no warp. 2026-08-15: behind a YES/NO — talking used to BE consent, and
  // mashing A through the pages re-ran the whole nap (Lyall's playtest).
  'npc:bunkgrunt': [
    {
      choice: {
        say: [['GRUNT: Bunks', 'are free. Only', 'perk of the job.'], ['Crash a while?', 'Full heal, free.']],
        yes: [
          // 'heal' was never a registered sfx id (silent no-op since QOL.9);
          // 'item' is the existing rising jingle — closest fit for the rest chime
          { sfx: 'item' },
          { healParty: true },
          { say: [['...zzz...'], ['Party rested up!', 'Back to work,', 'grunt.']] },
          // CH2.10: game-voice receipt AFTER the dialogue closes — the say above
          // is chatter, this is the system confirming the heal actually happened.
          { sysMsg: ['ALL MONS RESTED', 'AND HEALED!'] },
        ],
        no: [{ say: [['GRUNT: Suit', 'yourself. Bunks', "ain't going far."]] }],
      },
    },
  ],
  // SIDE.5: once CH1 wraps (missionDone) Myowth's heist coaching gives way
  // to the stealth school — chatter, then a warp into the training room
  // (talking IS consent; the room's exit is one step down, so backing out
  // costs two steps). Mid-heist he keeps the original guidance.
  'npc:myowth': [
    { addEgg: 'myowth' },
    {
      if: { notFlag: 'missionDone' },
      then: [
        {
          say: [
            ["MYOWTH: That's", 'right! Myowth', 'talks!'],
            ['Beat the guard,', 'poke the POSTER,', 'grab the loot.'],
            ['Easy money, see?'],
          ],
        },
      ],
      else: [
        {
          say: [
            ['MYOWTH: Sneak', 'school is open,', 'see?'],
            ['Slip past the', 'guard, tag the', 'pad, get paid.'],
            ['Follow me!'],
          ],
        },
        { warp: ['hqDrill', 5, 8, 'up'] },
      ],
    },
  ],
  // The lone terminal at (3,11) is the MON LOCKER; the other C consoles stay
  // locked flavour. Positional `at:` scripts win over the generic `tile:C`.
  'at:3,11': [{ sfx: 'beep' }, { say: [['MON LOCKER', 'ONLINE.']] }, { locker: true }],
  // SIDE.1: the console under the NOTICE sign is the JOB BOARD — repeatable
  // rank-gated contracts (systems/jobs.ts). Its own pulsing `J` tile so it
  // reads as interactive (SIDE.1-FB), and a one-time explainer on first use.
  'tile:J': [
    { sfx: 'beep' },
    {
      if: { notFlag: 'jobsIntroSeen' },
      then: [
        { setFlag: 'jobsIntroSeen' },
        {
          say: [
            ['JOB BOARD ONLINE.', 'SIDE WORK FOR', 'AMBITIOUS GRUNTS.'],
            ['TAKE A CONTRACT,', 'DO THE JOB, COME', 'BACK FOR COINS.'],
            ['HIGHER RANKS GET', 'BETTER CONTRACTS.', 'EARN IT, GRUNT.'],
          ],
        },
      ],
      else: [{ say: [['JOB BOARD', 'ONLINE.']] }],
    },
    { jobs: true },
  ],
  'tile:C': [{ sfx: 'beep' }, { say: [['ROKKET-OS v2.1', 'PASSWORD: ******', 'ACCESS DENIED.']] }],
  'tile:L': [{ say: [['Spare uniforms.', 'They all smell', 'of smoke bombs.']] }],
  'tile:D': [{ say: [["THE BOSS'S DESK.", 'Better not', 'touch anything.']] }],
  'tile:X': [{ say: [['Crates of...', 'you would rather', 'not know.']] }],
  'tile:P': [{ say: [['A plastic plant.', 'Even the plants', 'here are fake.']] }],
  enter: [
    {
      if: { flag: 'lootTaken' },
      then: [
        {
          if: { notFlag: 'missionDone' },
          then: [
            {
              say: [
                ['GIOVANNI: You...', 'actually did it?'],
                ['Bring that case', 'here, grunt.', 'NOW.'],
              ],
            },
          ],
        },
      ],
    },
  ],
};
