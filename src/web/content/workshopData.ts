// The words of the Workshop planning starter: what each phase holds, in the order of the template it comes from.
// Rows of the original tables are notes (name = the row, text = the blanks to fill in); lists of checks are checklists.
export type Note = { name: string; text?: string };
export type Group =
  | { k: 'coll'; name: string; notes: Note[]; col: number; span?: 1 | 2 }
  | { k: 'todo'; text: string; items: string[]; col: number }
  | { k: 'note'; name: string; text: string; col: number }
  | { k: 'kanban'; name: string; cols: { name: string; notes?: Note[] }[]; col: number; span: 2 | 3 | 4 };
export type Phase = { title: string; color: string; cols: number; groups: Group[] };

export const SNAPSHOT: Note = {
  name: 'Workshop snapshot (fill last, keep at the top)',
  text: [
    'Workshop name:',
    'Type (client discovery / internal / training / hybrid):',
    'Date(s) & time (with time zone):',
    'Location / link:',
    'Sponsor / requester:',
    'Lead facilitator:',
    'Participants (number):',
    'One-sentence purpose:',
    'Success looks like:',
    'Status (Define / Design / Prepare / Ready / Done):',
  ].join('\n'),
};

export const HOW_TO =
  'Work from left to right: Define, Design, Prepare, Run, Follow up. Tick items as you go.\n\nAnything you can’t answer is a risk: add it to the risks at the bottom. Delete the optional modules that don’t apply.\n\nSet a due date on a milestone or an action (the calendar button) and I’ll remind you. Once you know the purpose, ask me to fill in the snapshot or draft the run of show ✦';

export const FOOTER =
  'Review and adapt before sharing externally. This template is guidance, not legal, financial, or regulatory advice; consult Legal, Compliance, or the Data Privacy Officer where relevant.';

const q = (name: string): Note => ({ name });
const row = (name: string, text: string): Note => ({ name, text });

export const EARLY_PHASES: Phase[] = [
  {
    title: 'Define',
    color: 'sky',
    cols: 4,
    groups: [
      {
        k: 'coll',
        name: '1 · Purpose, outcomes, scope',
        col: 0,
        span: 2,
        notes: [
          q('What problem or opportunity triggers this workshop?'),
          q('Why a workshop (vs. email, interviews, a meeting)?'),
          q('Primary outcome (decision, shared understanding, ideas, prioritised list, skills)'),
          q('Concrete deliverables / outputs (what exists at the end?)'),
          q('Out of scope'),
          q('Decisions that must be made vs. ideas that may be explored'),
          q('Who owns the outputs after the session?'),
          q('Success measures (how will we know it worked, at 1 week / 1 month?)'),
          q('Constraints (budget, deadlines, politics, dependencies)'),
        ],
      },
      {
        k: 'todo',
        text: 'Define checks',
        col: 0,
        items: ['Purpose and outcomes agreed with sponsor', 'Workshop-vs-alternative question honestly answered'],
      },
      {
        k: 'coll',
        name: '2.1 · Participant map',
        col: 1,
        notes: [
          row(
            'Name · role / team',
            'Why needed:\nMust attend?\nPre-work?\nAccessibility / dietary / language needs:\nConfirmed?',
          ),
        ],
      },
      {
        k: 'todo',
        text: 'Participant checks',
        col: 2,
        items: [
          'Right voices in the room (decision-makers, doers, users, sceptics)',
          'Group size fits format (small core group of ~5–8 for deep work; larger needs sub-groups)',
          'Power dynamics considered (seniority, client vs. vendor, dominant voices)',
          'Backups identified for key attendees',
        ],
      },
      {
        k: 'coll',
        name: '2.2 · Roles',
        col: 2,
        span: 2,
        notes: [
          row('Sponsor', 'Opens/closes, legitimises, removes blockers\nName:'),
          row('Lead facilitator', 'Runs the process, holds time and neutrality\nName:'),
          row('Co-facilitator / producer', 'Tech, breakout rooms, parking lot, backup\nName:'),
          row('Scribe / documenter', 'Captures decisions, actions, photos / board exports\nName:'),
          row('Timekeeper', 'Time checks, break discipline\nName:'),
          row('Subject-matter expert(s)', 'Inputs on demand\nName:'),
          row('Observer(s)', 'Rules for participation agreed upfront\nName:'),
        ],
      },
    ],
  },
  {
    title: 'Design · time and place',
    color: 'lilac',
    cols: 4,
    groups: [
      {
        k: 'coll',
        name: '3 · Time',
        col: 0,
        span: 2,
        notes: [
          q('Date(s) / alternates'),
          q('Total duration & start/end times'),
          q('Time zones of participants (hybrid/remote)'),
          q('Calendar conflicts checked (holidays, quarter-end, peaks)'),
          q('Energy curve (hardest work in the morning? post-lunch slump?)'),
          q('Buffer built in (≥10–15% contingency)'),
          q('Breaks: count, length, timing'),
          q('Pre-work time required of participants'),
          q('Post-work window (follow-up call, report delivery)'),
        ],
      },
      {
        k: 'todo',
        text: '4.1 · Venue (in person)',
        col: 2,
        items: [
          'Room size fits group plus movement and breakouts',
          'Layout planned (cabaret / U-shape / open space; no theatre rows for co-creation)',
          'Wall/whiteboard/flipchart space for visual work',
          'Natural light, ventilation, noise level',
          'Breakout spaces available',
          'Access (step-free, travel, parking, security/visitor passes)',
          'Catering and dietary options confirmed',
          'Wi-Fi, power, projector/screen checked',
          'Access time to set up (≥60 min before)',
        ],
      },
      {
        k: 'todo',
        text: '4.2 · Virtual / hybrid',
        col: 3,
        items: [
          'Platform chosen and approved by all parties (client security rules checked)',
          'Digital whiteboard (e.g., Miro/Mural) set up, access tested for external guests',
          'Breakout room mechanics tested',
          'Hybrid: room camera/microphone quality tested; remote participants have equal voice (dedicated remote champion)',
          'Backup channel if platform fails (phone bridge, alternate link)',
          'Participants’ tech guidance sent (browser, login, cameras on/off)',
        ],
      },
      {
        k: 'kanban',
        name: '3.1 · Backward planning timeline',
        col: 0,
        span: 4,
        cols: [
          {
            name: 'Before: T-8 to T-3 weeks',
            notes: [
              row('T-8 to 4 weeks', 'Purpose agreed; date held; venue/tool booked; placeholder invites sent\nOwner:'),
              row('T-4 to 3 weeks', 'Participants confirmed; roles assigned; budget approved\nOwner:'),
              row('T-3 weeks', 'Draft agenda reviewed with sponsor; pre-work designed\nOwner:'),
            ],
          },
          {
            name: 'Final stretch: T-2 weeks to T-1 day',
            notes: [
              row('T-2 weeks', 'Formal invite + pre-read + pre-work sent; materials ordered\nOwner:'),
              row('T-1 week', 'Reminders; pre-work chased; agenda finalised; facilitator rehearsal / dry run\nOwner:'),
              row(
                'T-2 to 1 days',
                'Tech check; room/board set-up (or test link); print packs; final logistics message\nOwner:',
              ),
            ],
          },
          {
            name: 'Run and after: T-0 to T+4 weeks',
            notes: [
              row('T-0', 'Run workshop\nOwner:'),
              row('T+1 day', 'Photo/board capture secured; thank-you note; draft actions circulated\nOwner:'),
              row('T+1 week', 'Summary + action log issued; follow-up meeting held; feedback analysed\nOwner:'),
              row('T+4 weeks', 'Action review; outcome check against success measures\nOwner:'),
            ],
          },
          { name: 'Done' },
        ],
      },
    ],
  },
  {
    title: 'Design · format and agenda',
    color: 'lilac',
    cols: 4,
    groups: [
      {
        k: 'coll',
        name: '5.1 · Format choices',
        col: 0,
        span: 2,
        notes: [
          row('Mode (in person / remote / hybrid)', 'Decision:\nRationale:'),
          row('Style (divergent ideation / convergent decision / learning / alignment)', 'Decision:\nRationale:'),
          row(
            'Methods (e.g., 1-2-4-All, brainwriting, dot voting, journey map, effort/impact matrix)',
            'Decision:\nRationale:',
          ),
          row('Group structure (plenary / pairs / trios / breakouts)', 'Decision:\nRationale:'),
          row('Ground rules / working agreements', 'Decision:\nRationale:'),
          row('Psychological safety measures', 'Decision:\nRationale:'),
          row('Documentation approach (live board, photos, recording)', 'Decision:\nRationale:'),
        ],
      },
      {
        k: 'coll',
        name: '5.2 · Run of show',
        col: 2,
        span: 2,
        notes: [
          row(
            'Welcome, purpose, agenda, ground rules',
            'Start:\nMin: 10\nPurpose / output: Shared frame\nMethod: Plenary\nLead: Sponsor / Facilitator\nMaterials: Slide, flipchart\nPlan B:',
          ),
          row(
            'Icebreaker / check-in',
            'Start:\nMin: 10\nPurpose / output: Energy, inclusion\nMethod:\nLead:\nMaterials:\nPlan B:',
          ),
          row('Core block 1', 'Start:\nMin:\nPurpose / output:\nMethod:\nLead:\nMaterials:\nPlan B:'),
          row('Break', 'Start:\nMin: 10–15'),
          row('Core block 2', 'Start:\nMin:\nPurpose / output:\nMethod:\nLead:\nMaterials:\nPlan B:'),
          row(
            'Synthesis / prioritisation',
            'Start:\nMin:\nPurpose / output: Decisions\nMethod:\nLead:\nMaterials:\nPlan B:',
          ),
          row(
            'Actions, owners, dates',
            'Start:\nMin: 15\nPurpose / output: Commitments\nMethod:\nLead:\nMaterials:\nPlan B:',
          ),
          row(
            'Close + feedback',
            'Start:\nMin: 5–10\nPurpose / output: Check-out\nMethod:\nLead:\nMaterials:\nPlan B:',
          ),
        ],
      },
      {
        k: 'todo',
        text: 'Design checks',
        col: 0,
        items: [
          'Every block ties to an outcome from Define',
          'Mix of individual thinking, small groups, and plenary',
          'Hardest cognitive work not scheduled late in the day',
          'Time estimates validated in a dry run',
          '“Must” vs. “nice to have” blocks marked, so cuts can be made live',
          'Agenda shared with sponsor and agreed',
        ],
      },
    ],
  },
];
