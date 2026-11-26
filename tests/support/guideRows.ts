// What the "Myra sees" strip's rules and design chips say in each case, said in full and not read from the table the strip
// draws from, so a change to the words is a change to the test that reads this.
import type { CardOf } from '../../src/shared/model.ts';

// Each case for each document: the card the board has for it (none, or one with words or without, saying Ignore or not),
// and what its chip then says.
export type Role = 'rules' | 'design';
export type Row = {
  what: string;
  card: Partial<CardOf<'doc'>> | null;
  label: string;
  tip: string;
  press: boolean;
  dashed: boolean;
};
type Rows = { repo: Row; both: Row; boardOnly: Row; ignored: Row };
export const ROWS: Record<Role, Rows> = {
  rules: {
    repo: {
      what: 'the repo’s file alone',
      card: null,
      label: 'Repo rules',
      tip: 'prototypes/myra.md goes with every build of this prototype',
      press: false,
      dashed: false,
    },
    both: {
      what: 'the repo’s file and the board’s words',
      card: { body: 'Use British English.' },
      label: 'Repo + board rules',
      tip: 'prototypes/myra.md and this board’s rules go with every build; where they differ, the board’s win',
      press: true,
      dashed: false,
    },
    boardOnly: {
      what: 'the board’s words, the repo’s file ignored',
      card: { body: 'Use British English.', ignoreRepo: true },
      label: 'Board rules',
      tip: 'Only this board’s rules go with every build: prototypes/myra.md is ignored',
      press: true,
      dashed: false,
    },
    ignored: {
      what: 'the repo’s file ignored and no words',
      card: { ignoreRepo: true },
      label: 'Repo rules · ignored',
      tip: 'prototypes/myra.md is ignored and this board’s rules are empty, so no rules go with a build',
      press: false,
      dashed: true,
    },
  },
  design: {
    repo: {
      what: 'the repo’s file alone',
      card: null,
      label: 'Repo design',
      tip: 'prototypes/design.md goes with every build of this prototype',
      press: false,
      dashed: false,
    },
    both: {
      what: 'the repo’s file and the board’s words',
      card: { body: 'Square corners.' },
      label: 'Repo + board design',
      tip: 'prototypes/design.md and this board’s design go with every build; where they differ, the board’s wins',
      press: true,
      dashed: false,
    },
    boardOnly: {
      what: 'the board’s words, the repo’s file ignored',
      card: { body: 'Square corners.', ignoreRepo: true },
      label: 'Board design',
      tip: 'Only this board’s design goes with every build: prototypes/design.md is ignored',
      press: true,
      dashed: false,
    },
    ignored: {
      what: 'the repo’s file ignored and no words',
      card: { ignoreRepo: true },
      label: 'Repo design · ignored',
      tip: 'prototypes/design.md is ignored and this board’s design is empty, so no design goes with a build',
      press: false,
      dashed: true,
    },
  },
};
export const ROLES = ['rules', 'design'] as const;
// with no repo, the board's words alone
export const BOARD_ONLY = {
  rules: 'This board’s rules go with every build',
  design: 'This board’s design goes with every build',
};
