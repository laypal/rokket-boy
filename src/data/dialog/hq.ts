// ROKKET HQ B1F — dialogue & interaction scripts (ported from npcDialog/interact v2).
import type { ScriptStep } from '../../types';
import { EGG_TOTAL } from '../eggs';

export const hqScripts: Record<string, ScriptStep[]> = {
  // CH2.4/CH3.3/CH4.3: outermost branches first — the newest chapter's
  // afterglow, then its briefing (replacing the PREVIOUS chapter's afterglow
  // line in that slot, the same way CH3 replaced CH2's), then the untouched
  // older chain. KIRA runs the span and promotes the player herself
  // (span_kira's onWin), so there is no CH3 hand-in branch here — just the
  // briefing and afterglow that bookend it. CH4 is the same shape: the
  // chief's ss_chief2.onWin sets ch4Done and promotes directly, no hand-in.
  'npc:giovanni': [
    {
      if: { flag: 'ch4Done' },
      then: [
        { say: [['GIOVANNI: The', 'chief fell. Good.'], ['LIEUTENANT now.', 'Do not slow down.']] },
      ],
      else: [
        {
          if: { flag: 'ch3Done' },
          then: [
            // ONB.3: heard — Giovanni's `!` goes out (todoIf in maps/hq.ts)
            { setFlag: 'ch4Briefed' },
            {
              say: [
                ['GIOVANNI:', 'OPERATIVE. New', 'job tonight.'],
                ['The S.S. ANN', 'gala. Their', "captain's safe."],
                ['Jessika waits', 'at the dock, east', 'of CERULEUN EDGE.'],
                ["Walk in, don't", 'run. Sailors', "don't sprint."],
              ],
            },
            // QA.5: last step — surfaces once the dialog closes.
            { sysMsg: ['NEW JOB!', 'CHECK STATUS.'] },
          ],
          else: [
            {
              if: { flag: 'ch2Done' },
              then: [
                // ONB.3: heard — Giovanni's `!` goes out (todoIf in maps/hq.ts)
                { setFlag: 'ch3Briefed' },
                { say: [['GIOVANNI: AGENT.', 'A new racket.', 'The NUGGET SPAN.'], ['East of MT. MOON.', 'We run a "prize', 'bridge" there.'], ['Five marks paid', 'to cross. Beat', 'them. Keep it.'], ['AGENT KIRA runs', 'the span. Do as', 'she says.']] },
                // QA.5: last step in the branch — surfaces once the dialog
                // closes (sysMsg only ticks in worldDraw), telling the player
                // STATUS just moved on.
                { sysMsg: ['NEW JOB!', 'CHECK STATUS.'] },
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
                // ONB.6: first promotion's tutorial. Safe after endScreen (1e rule) because
                // sysMsg only ticks in worldDraw — it surfaces once MISSION COMPLETE is
                // dismissed. Fires once; span_kira's onWin (rank 3) gets none.
                { sysMsg: ['RANK LADDER:', 'START > STATUS', '> RANK'] },
              ],
              else: [
                {
                  if: { flag: 'missionDone' },
                  then: [
                    // ONB.3: heard — Giovanni's `!` goes out (todoIf in maps/hq.ts)
                    { setFlag: 'ch2Briefed' },
                    {
                      say: [
                        ['GIOVANNI: New', 'job. A dig site', 'in MT. MOON.'],
                        ['Cave mouth is', 'east of the', 'GAMEZ CORNER.'],
                        ['Scientists dug', 'up a PAIR of', 'fossils. Fetch.'],
                      ],
                    },
                    // QA.5: last step — surfaces once the dialog closes.
                    { sysMsg: ['NEW JOB!', 'CHECK STATUS.'] },
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
                            // QA.5: last step — surfaces once the dialog closes.
                            { sysMsg: ['NEW JOB!', 'CHECK STATUS.'] },
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
            // ONB.5: a fresh save has coins:0, items:[] — without a hand-over
            // here the ITEM menu is empty at the exact moment the mid-battle
            // coaching (encounters.ts spar_jessika.coach) tells the player to
            // use one.
            //
            // ONB.5-FB: the give carries its OWN flag. Gating it on this
            // branch's drillBattleDone was not enough — that flag is only set
            // on a WIN (encounters.ts onWin), so taking the SODA and then
            // fleeing left it clear and handed out another on the next talk,
            // forever. sparSodaGiven is set the moment the item lands.
            yes: [
              {
                if: { notFlag: 'sparSodaGiven' },
                then: [
                  { giveItem: 'SODA' },
                  { setFlag: 'sparSodaGiven' },
                  { say: [['Catch. One SODA.', 'On the house.']] },
                ],
              },
              { say: [['Rule one:', 'no mercy!']] },
              { battle: 'spar_jessika' },
            ],
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
            // ONB.4: the egg hint. The count is the registry's (EGG_TOTAL)
            // — never a literal, so this can never drift from what STATUS
            // reports.
            ['Oh, and EGGS.', 'Hidden all over.', EGG_TOTAL + ' of them, see?'],
            ['Poke anything', 'that looks wrong.', 'Press A, see?'],
            ['Cracked bricks.', 'Dead ends. Signs', 'that read funny.'],
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
  // SIDE.4: the GRUNTDEX clerk. Completion is a Cond, not a step (the dex is
  // derived from what the player holds — quest.setDexMons), so the clerk is
  // pure data: paid once, then a brush-off forever.
  'npc:dexclerk': [
    {
      if: { egg: 'dexmaster' },
      then: [{ say: [['CLERK: Paid you', 'already. Go steal', 'something.']] }],
      else: [
        {
          if: { dexComplete: true },
          then: [
            { addEgg: 'dexmaster' },
            { sfx: 'item' },
            { say: [['CLERK: Every line', 'in the GRUNTDEX.', "Didn't think so."], ['Take the egg.', "Don't ask what's", 'in it.']] },
            { sysMsg: ['EGG FOUND!'] },
          ],
          else: [{ say: [['CLERK: GRUNTDEX', 'desk. Fill it', 'and I pay out.'], ['Every line. Not', 'just the cute', 'ones.']] }],
        },
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
    // ONB.8: the cold open ends on G.'s written note; this is him saying the
    // next line out loud. Gated so it fires once and never greets a player
    // who has walked back in from the Gamez Corner. Runs before the
    // lootTaken check below; on a fresh game introSeen is set long before
    // lootTaken can be. Only a pre-ONB.8 save carrying the loot hears both,
    // in order, once.
    {
      if: { notFlag: 'introSeen' },
      then: [
        { setFlag: 'introSeen' },
        { say: [['GIOVANNI:', 'TONIGHT IS YOUR', 'FIRST JOB.']] },
      ],
    },
    // ONB.2: Myowth's tour — new players only: a returning save has
    // `briefed` set and never sees it. `introToured` is set BEFORE the
    // tour runs, so a skip — or a reload mid-tour — never replays it.
    // Ends aimed at the desk: the tour delivers you to the boss, the
    // briefing talk is yours to start (his ONB.3 `!` is already up).
    {
      if: { all: [{ notFlag: 'introToured' }, { notFlag: 'briefed' }] },
      then: [
        { setFlag: 'introToured' },
        { say: [['MYOWTH: New meat!', 'Lemme show ya', 'round the place.']] },
        {
          tour: {
            stops: [
              { cam: [96, 176], lines: ['THE MARKET.', 'Balls, sodas,', 'smokes. Stock up.'] },
              { cam: [48, 144], lines: ['THE BUNKS.', 'Nap here, mons', 'patched up free.'] },
              { cam: [224, 32], lines: ['THE JOB BOARD.', 'Side work pays', 'coins and XP.'] },
              { cam: [160, 32], lines: ['THE BACK ROOM.', 'Rare gear, if', 'yer rank cuts it.'] },
              { cam: [112, 48], lines: ['THE BOSS.', 'Go get yer first', 'job. Move it!'] },
            ],
          },
        },
      ],
    },
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
    // FLW.5: a hand-in is waiting — pan to the desk so the player knows
    // WHERE it happens; ONB.3's standing `!` on Giovanni does the rest.
    // The terms are the HAND-IN half of his todoIf, never the briefing
    // half: a briefing is a thing you go looking for, a hand-in is a
    // thing the building owes you directions to.
    {
      if: {
        any: [
          { all: [{ flag: 'lootTaken' }, { notFlag: 'missionDone' }] },
          { all: [{ flag: 'bradBeaten' }, { notFlag: 'ch2Done' }] },
        ],
      },
      then: [{ tour: { stops: [{ cam: [112, 48], lines: ['THE BOSS WANTS', 'A WORD.'] }] } }],
    },
  ],
};
