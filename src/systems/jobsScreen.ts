// JOB BOARD screen (SIDE.1 + the SIDE.1-FB playtest rework) — the HQ
// terminal UI over systems/jobs.ts. Opened by a `{ jobs: true }` script step;
// suspends the script until the player leaves, then resumes with no
// follow-up (the shop.ts idiom, and the same window layout).
//
// SIDE.1-FB layout rule: the THREE SLOTS are always the root view. The
// active contract sits in its slot with a `*` marker and live progress; A on
// it opens a HAND IN / ABANDON / BACK submenu, and B always steps back
// (submenu → list → world) instead of dumping the player out — Lyall's
// playtest catch on v1, where taking a job hid the list entirely.
import { G } from '../state';
import { quest } from './quest';
import {
  boardRows,
  takeJob,
  canHandIn,
  handInJob,
  abandonJob,
  jobLabel,
  jobFooter,
  jobProgressLine,
} from './jobs';

/** List-row text budget derived from the draw geometry: rows start at x=18
 *  and the body window's interior right edge sits at ~154, so 17 glyphs fit —
 *  one of which the active-contract `*` marker may take. Linted in
 *  tests/jobs.test.ts (the MNU.2 derive-and-lint pattern). */
export const JOB_ROW_CAP = 17;
import { text } from '../engine/renderer';
import { Input } from '../engine/input';
import { Audio2 } from '../engine/audio';
import type { Palette } from '../data/palettes';
import { listInput, flash, tickFlash, drawScreenChrome } from './ui/listScreen';

interface JobsState {
  view: 'list' | 'sub';
  sel: number;    // list row 0–2
  subSel: number; // submenu row
  msg: string | null;
  msgT: number;
  done: () => void;
}
let S: JobsState | null = null;

const SUB_ROWS = ['HAND IN', 'ABANDON', 'BACK'];

export function openJobs(done: () => void): void {
  Audio2.sfx('confirm');
  S = { view: 'list', sel: 0, subSel: 0, msg: null, msgT: 0, done };
  G.state = 'jobs';
}

function leave(): void {
  const s = S!;
  Audio2.sfx('cancel');
  const done = s.done;
  S = null;
  G.state = 'world';
  done();
}

export function jobsUpdate(): void {
  const s = S!;
  tickFlash(s);
  const n = s.view === 'list' ? 3 : SUB_ROWS.length;
  if (s.view === 'list') s.sel = listInput(s.sel, n);
  else s.subSel = listInput(s.subSel, n);
  if (Input.hit('a')) {
    if (s.view === 'list') {
      const row = boardRows()[s.sel];
      if (!quest.job) {
        takeJob(row);
        flash(s, 'CONTRACT TAKEN!', true);
      } else if (quest.job.slot === s.sel) {
        Audio2.sfx('confirm');
        s.view = 'sub';
        s.subSel = 0;
      } else flash(s, 'FINISH YOUR JOB.');
    } else if (s.subSel === 0) {
      if (canHandIn()) {
        const paid = handInJob()!;
        s.view = 'list';
        flash(s, '+' + paid + ' COINS!', true);
      } else flash(s, 'NOT DONE YET.');
    } else if (s.subSel === 1) {
      abandonJob();
      s.view = 'list';
      flash(s, 'CONTRACT DROPPED.');
    } else {
      Audio2.sfx('cancel');
      s.view = 'list';
    }
    return;
  }
  // B steps BACK, never dumps out of a submenu (SIDE.1-FB)
  if (Input.hit('b') || Input.hit('start')) {
    if (s.view === 'sub') {
      Audio2.sfx('cancel');
      s.view = 'list';
    } else leave();
  }
}

export function jobsDraw(pal: Palette): void {
  const s = S!;
  const rows = boardRows();
  // footer: transient message, else context help for the selection
  const footer =
    s.msgT > 0 && s.msg ? s.msg :
    s.view === 'sub' ? jobProgressLine() :
    quest.job?.slot === s.sel ? jobProgressLine() : jobFooter(rows[s.sel]);
  drawScreenChrome(pal, 'JOB BOARD', '$' + quest.coins, footer);
  if (s.view === 'list') {
    // label-only rows: a right-aligned payout column collides with the
    // widest labels ("3x ROKKET BALL" + "$650" > 20 glyph columns — caught
    // by the MNU.2 screenshot rule), and the footer already shows the
    // selection's payout/progress. JOB_ROW_CAP pins the geometry in the lint.
    rows.forEach((o, i) => {
      const active = quest.job?.slot === i;
      const y = 34 + i * 18;
      if (i === s.sel) text('>', 8, y, pal[0]);
      text((active ? '*' : '') + jobLabel(o), 18, y, pal[0]);
    });
  } else {
    const j = quest.job!;
    text('*' + jobLabel(j), 18, 34, pal[0]);
    text(jobProgressLine(), 18, 46, pal[2]);
    SUB_ROWS.forEach((it, i) => {
      const y = 64 + i * 14;
      if (i === s.subSel) text('>', 8, y, pal[0]);
      text(it, 20, y, pal[0]);
    });
  }
}
