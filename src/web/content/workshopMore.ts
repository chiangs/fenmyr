// The rest of the Workshop planning starter: Prepare, Run, Follow up, and the closing row (risks, compliance, optional modules, version log).
import type { Group, Note, Phase } from './workshopData.ts';

const row = (name: string, text: string): Note => ({ name, text });

export const LATE_PHASES: Phase[] = [
  {
    title: 'Prepare',
    color: 'butter',
    cols: 4,
    groups: [
      {
        k: 'kanban',
        name: '6.3 · Pre-work & communications',
        col: 0,
        span: 2,
        cols: [
          {
            name: 'To send',
            notes: [
              row('Placeholder / save-the-date', 'Audience: All\nSend date:\nContent: Date, purpose in one line'),
              row(
                'Formal invitation',
                'Audience: All\nSend date:\nContent: Purpose, outcomes, agenda, logistics, role of attendee',
              ),
              row(
                'Pre-read / pre-work brief',
                'Audience: Attendees\nSend date:\nContent: What to read/do, time needed, due date',
              ),
              row('Sponsor briefing', 'Audience: Sponsor\nSend date:\nContent: Opening remarks, behaviours expected'),
              row('Reminder', 'Audience: All\nSend date:\nContent: Logistics, pre-work chase'),
              row(
                'Final logistics note',
                'Audience: All\nSend date:\nContent: Directions/links, dress code, tech check',
              ),
            ],
          },
          { name: 'Sent' },
        ],
      },
      {
        k: 'coll',
        name: '6.1 · Resources',
        col: 2,
        notes: [
          row('People (facilitators, SMEs, tech support)', 'Needed:\nOwner:\nStatus:'),
          row('Budget (venue, catering, travel, tools, printing)', 'Needed:\nOwner:\nStatus:'),
          row('Tools / licences (whiteboard, voting, survey, transcription)', 'Needed:\nOwner:\nStatus:'),
          row('Pre-read content', 'Needed:\nOwner:\nStatus:'),
          row('Data / evidence to bring (research, metrics, personas)', 'Needed:\nOwner:\nStatus:'),
        ],
      },
      {
        k: 'todo',
        text: '6.2 · Materials',
        col: 3,
        items: [
          'Sticky notes (multiple colours), markers, dot stickers',
          'Flipcharts / paper rolls, tape, blu-tack',
          'Printed agenda, canvases, templates, handouts',
          'Name tags / table cards',
          'Timer visible to all',
          'Laptop, chargers, adapters, clicker, speakers',
          'Digital boards pre-built with frames, instructions, and timers',
          'Slide deck (minimal; process-driven, not content-heavy)',
          'Parking-lot board; decision and action log templates',
          'First-aid / accessibility needs addressed',
          'Spare of everything critical',
        ],
      },
      {
        k: 'todo',
        text: '6.4 · Meetings to schedule',
        col: 2,
        items: [
          'Kick-off / briefing with sponsor',
          'Agenda review with sponsor (T-3 weeks)',
          'Facilitation team dry run / rehearsal',
          'Tech check (remote/hybrid)',
          'Debrief (facilitation team, same or next day)',
          'Follow-up meeting with participants (T+1 to 2 weeks)',
        ],
      },
    ],
  },
  {
    title: 'Run',
    color: 'mint',
    cols: 3,
    groups: [
      {
        k: 'todo',
        text: '7 · Before (arrive early)',
        col: 0,
        items: [
          'Room set; tech tested; materials laid out; catering arranged',
          'Roles briefed; run of show printed',
          'Digital board open; recording/consent set up if used',
        ],
      },
      {
        k: 'todo',
        text: '7 · During',
        col: 1,
        items: [
          'Open with sponsor; state purpose, outcomes, ground rules',
          'Hold time; call Plan B when slipping',
          'Capture decisions and actions visibly as they happen',
          'Keep a parking lot for off-topic items',
          'Monitor energy and participation; adapt',
          'Photograph/export boards before they are cleared',
        ],
      },
      {
        k: 'todo',
        text: '7 · Close',
        col: 2,
        items: [
          'Read back decisions, actions, owners, due dates',
          'Explain what happens next and when participants hear back',
          'Collect feedback (see Follow up)',
          'Thank participants and sponsor',
        ],
      },
    ],
  },
  {
    title: 'Follow up',
    color: 'peach',
    cols: 4,
    groups: [
      {
        k: 'coll',
        name: '8.1 · Feedback loops',
        col: 0,
        span: 2,
        notes: [
          row(
            'Pulse check',
            'When: Mid-session\nMethod: Thumb vote / mood board\nWho: Participants\nOutput: Real-time adjustments',
          ),
          row(
            'Exit feedback',
            'When: End of session\nMethod: 3-question form or +/Δ\nWho: Participants\nOutput: Immediate reaction',
          ),
          row(
            'Sponsor feedback',
            'When: T+1 to 3 days\nMethod: Short call\nWho: Sponsor\nOutput: Outcome vs. expectation',
          ),
          row(
            'Facilitation team debrief',
            'When: T+0 to 1 day\nMethod: What worked / didn’t / change\nWho: Team\nOutput: Lessons learned',
          ),
          row(
            'Outcome check',
            'When: T+2 to 4 weeks\nMethod: Survey or check-in\nWho: Participants + sponsor\nOutput: Were actions completed? Impact?',
          ),
          row(
            'Template improvement',
            'When: After debrief\nMethod: Update this template\nWho: Facilitator\nOutput: Version log',
          ),
        ],
      },
      {
        k: 'note',
        name: 'Suggested exit questions',
        col: 3,
        text: '1. Did we achieve the purpose? (1–5)\n2. What was most valuable?\n3. What should change?\n4. Are you clear on your next action?',
      },
      {
        k: 'todo',
        text: '8.2 · Outputs and actions',
        col: 2,
        items: [
          'Summary document (decisions, outputs, rationale) issued within 48 hrs–1 week',
          'Action log with owner, due date, status',
          'Raw materials archived (photos, board export) in an agreed location',
          'Parking-lot items allocated',
          'Follow-up meeting held',
          'Participants informed of progress',
        ],
      },
      {
        k: 'kanban',
        name: 'Action log',
        col: 0,
        span: 3,
        cols: [
          { name: 'To do', notes: [row('First action', 'Owner:\nDue: (set a due date on this note)')] },
          { name: 'Doing' },
          { name: 'Done' },
        ],
      },
    ],
  },
];

// the closing row: risks and compliance, the optional modules, the version log
export const RISKS: Group = {
  k: 'kanban',
  name: '9 · Risks and open questions',
  col: 0,
  span: 4,
  cols: [
    {
      name: 'To assess',
      notes: [
        row('Key decision-maker absent', 'Likelihood:\nMitigation: Delegate / reschedule / sponsor pre-brief\nOwner:'),
        row('Pre-work not completed', 'Likelihood:\nMitigation: Reminders; make session robust without it\nOwner:'),
        row('Overrun / unrealistic agenda', 'Likelihood:\nMitigation: Dry run; must-vs-nice blocks\nOwner:'),
        row('Tech failure', 'Likelihood:\nMitigation: Backup channel; tech check\nOwner:'),
        row(
          'Dominant voices / silent participants',
          'Likelihood:\nMitigation: Silent writing, small groups, round-robin\nOwner:',
        ),
        row('Unclear outputs / no follow-through', 'Likelihood:\nMitigation: Named owners and dates at close\nOwner:'),
      ],
    },
    { name: 'High impact' },
    { name: 'Medium impact' },
    { name: 'Low impact' },
  ],
};
export const COMPLIANCE: Group = {
  k: 'todo',
  text: 'Data & compliance flags',
  col: 0,
  items: [
    'Personal data (attendee lists, dietary/accessibility needs, photos, recordings): confirm lawful basis and consent; consult the Data Privacy Officer if unsure',
    'Client confidential material: confirm what may be shared on boards/tools',
    'Tool approval: confirm platforms are approved by internal IT/security and the client',
    'Recording / transcription: informed consent obtained',
    'Contractual or regulated content: route to Legal / Compliance',
  ],
};
export const MODULES: { text: string; items: string[] }[] = [
  {
    text: 'A · Client discovery / co-creation',
    items: [
      'Client sponsor and stakeholder map; political sensitivities noted',
      'Research/inputs gathered beforehand (interviews, data, current-state)',
      'Key questions the session must answer',
      'Prioritisation method chosen (e.g., effort/impact, dot voting)',
      'Clear next-step pathway (proposal, backlog, prototype, decision gate)',
      'Roles of client vs. our team in the room agreed',
      'Confidentiality and IP expectations clear',
      'Client-facing output reviewed before sharing',
    ],
  },
  {
    text: 'B · Internal team / alignment',
    items: [
      'Psychological safety and ground rules; hierarchy effects managed',
      'Link to team goals/OKRs/roadmap',
      'Decisions logged and communicated to wider team',
      'Cadence: when is the next check-in?',
    ],
  },
  {
    text: 'C · Training / enablement',
    items: [
      'Learning objectives written as observable outcomes',
      'Participant baseline (skills, experience) assessed',
      'Mix of input, practice, reflection (limit lecture blocks)',
      'Exercises/case studies tested; answer keys prepared',
      'Take-away materials / job aids',
      'Learning check (quiz, demo, application plan)',
      'Post-training reinforcement (30/60/90-day nudges, manager involvement)',
    ],
  },
  {
    text: 'D · Hybrid / remote add-ons',
    items: [
      'Shorter blocks, more breaks (screen fatigue); avoid sessions over ~3 hours without a long break',
      'Digital facilitation roles (host, chat monitor)',
      'Equal-voice rules (round-robin, raise hand, chat)',
      'Asynchronous pre-work and post-work spaces',
      'Time-zone fairness (rotate inconvenient slots)',
      'Digital boards pre-populated; participants onboarded to tool',
    ],
  },
];
export const VERSION_LOG: Note = {
  name: '11 · Version log & lessons learned',
  text: 'Date · Workshop · What I’d change in the template\n\n',
};
