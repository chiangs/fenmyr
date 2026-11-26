import type { AskFile } from './askFiles.ts';
import type { BuildEvent } from './build.ts';
import type { AppBuild } from './buildStamp.ts';
import type { ImportResult, Manifest } from './fenmyrZip.ts';
import type { ModelChoice, ProviderModels } from './models.ts';
import type { UpdateChannel } from './updateChannel.ts';

type None = Record<string, never>;

export type Board = { id: string; [key: string]: unknown };
export type BoardSummary = {
  id: string;
  name: string;
  color: string;
  folder: string | null;
  parent: string | null;
  updated: number;
  // set when the board has its own vault access (not its project's): the vaults it may read, and whether AI may read them
  vaultAccess?: { vault: string; ai: boolean }[];
  // a prototype board carries its code folder, so the library knows which folders boards already use
} & ({ kind?: never; dir?: never } | { kind: 'prototype'; dir: string });
export type Template = {
  id: string;
  name: string;
  desc?: string;
  mode?: string;
  cards: unknown[];
  [key: string]: unknown;
};

export type Vault = {
  id: string;
  name: string;
  path: string;
  obsidian: string;
  off: string[];
  obsidianFolder: boolean;
};
export type VaultPatch = { name?: string; obsidian?: string; off?: string[] };
export type VaultScan = { folders: string[]; notes: number };
export type NoteProps = [key: string, value: string][];
export type VaultListItem = { rel: string; title: string; folder: string; mtime: number };
export type VaultNote = {
  rel: string;
  title: string;
  props: NoteProps;
  tags: string[];
  excerpt: string;
  links: number;
  mtime: number;
  body?: string;
  truncated?: boolean;
};
export type VaultHit = {
  rel: string;
  title: string;
  tags: string[];
  props: NoteProps;
  excerpt: string;
  score: number;
  mtime: number;
  text: string;
};

// an unfinished task from a vault note: top-level, with its sub-tasks as a checklist (due: from a 📅 date or a "due::" field)
export type VaultTask = {
  rel: string;
  title: string;
  heading: string;
  text: string;
  due?: string;
  kids: { t: string; done: boolean }[];
};
export type VaultTasks = {
  tasks: VaultTask[];
  // open top-level tasks found, how many are sent (matching the request's words, up to a cap), and how many notes they come from
  open: number;
  sent: number;
  notes: number;
  scanned: number;
  // the scan ran out of time before every note was read
  stopped: boolean;
  // only tasks matching the request's own words were kept
  filtered: boolean;
};
export type VaultTaskForMyra = VaultTask & { vault: string };

export type UsageTotals = { asks: number; tokensIn: number; tokensOut: number; cost: number };
export type UsageSummary = { today: UsageTotals; week: UsageTotals; all: UsageTotals; since: number };

export type CaelestiaScheme = { name: string; mode: 'dark' | 'light'; colours: Record<string, string> };
export type LinkPreview = { title: string; desc: string; image: string };
export type Connections = { claude: boolean; mobbin: boolean; higgsfield: boolean };

// empty when installed some other way: the page says how to update then. Only an install made from a clone has a
// channel; on Stable and Beta it also names the newest release that channel can see.
export type UpdateInfo =
  | None
  | { repo: true; offline: true; since: string; channel?: UpdateChannel }
  | { repo: true; behind: number; since: string; notes: string[]; channel?: UpdateChannel; latest?: string }
  | { release: true; offline: true; since: string }
  | { release: true; behind: number; since: string; latest: string; notes: string[]; preview?: true };

export type Chattiness = 'quiet' | 'normal' | 'chatty';
export type MyraStyle = { name: string; chat: Chattiness; emoji: boolean };
export type SlashCommand = { cmd: string; arg?: string; desc: string; ex?: string | string[]; opts?: string[] };
/** A plan of Myra's waiting when a message was sent: the question it answered, her held reply as JSON without her
 *  words, and its steps as the chat shows them. */
export type PlanAsk = { request: string; reply: string; steps: string[] };

export type VaultNoteForMyra = { vault: string; path: string; title: string; tags: string[]; text: string };

type ImageJob = { id: string; label: string };

// what a folder is to git, so the page can say what linking it would mean
export type GitChange = {
  path: string;
  change: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked' | 'conflict';
};
export type GitStatus =
  | { kind: 'noGit' }
  | { kind: 'missing' }
  | { kind: 'folder' }
  // root differs from the folder asked about when that folder sits inside a repo
  | {
      kind: 'repo';
      root: string;
      // null when no branch is checked out
      branch: string | null;
      // the commit checked out; null until the repo's first commit, when there's nothing yet to push
      head: string | null;
      upstream: string | null;
      ahead: number;
      behind: number;
      changed: GitChange[];
      remotes: { name: string; url: string }[];
      identity: GitIdentity;
    };
// ok is false when a sign-in needs renewing
export type GhAccount = { host: string; login: string; active: boolean; ok: boolean };
export type GhState = { kind: 'missing' } | { kind: 'ready'; accounts: GhAccount[] };
export type PackageManager = 'pacman' | 'apt' | 'dnf' | 'zypper' | 'brew';
export type GitIdentity = { name: string; email: string };
// ghForGit: git pushes to GitHub with gh's sign-in
export type GitSetup = { git: boolean; identity: GitIdentity; ghForGit: boolean };

export type Ops = {
  list: { args: None; result: BoardSummary[] };
  load: { args: { id: string }; result: Board | null };
  save: { args: { board: Board }; result: true };
  remove: { args: { id: string }; result: true };
  templates: { args: None; result: Template[] };
  saveTemplate: { args: { template: Template }; result: true };
  removeTemplate: { args: { id: string }; result: true };
  vaults: { args: None; result: Vault[] };
  vaultPick: { args: None; result: string | null };
  vaultAdd: { args: { path: string }; result: Vault };
  vaultUpdate: { args: { id: string; patch: VaultPatch }; result: Vault };
  vaultRemove: { args: { id: string }; result: true };
  vaultScan: { args: { id: string }; result: VaultScan };
  vaultSearch: { args: { id: string; allow: string[]; query: string }; result: VaultHit[] };
  vaultTasks: { args: { id: string; allow: string[]; query: string }; result: VaultTasks };
  vaultNotes: { args: { id: string; allow: string[]; query: string }; result: VaultListItem[] };
  vaultNote: {
    args: { id: string; rel: string; allow: string[]; full?: boolean };
    result: VaultNote & { url: string };
  };
  // the page's library file (projects, folders, board order), stored as the page wrote it
  folders: { args: None; result: unknown };
  saveFolders: { args: { folders: unknown }; result: true };
  caelestia: { args: None; result: CaelestiaScheme | null };
  chromiumLicenses: { args: None; result: true };
  usage: { args: None; result: UsageSummary };
  resetUsage: { args: None; result: true };
  version: { args: None; result: string };
  appBuild: { args: None; result: AppBuild };
  linkPreview: { args: { url: string }; result: LinkPreview };
  fetchImage: { args: { url: string }; result: string };
  ask: {
    args: {
      prompt: string;
      board: { myraStyle?: MyraStyle; commands?: SlashCommand[]; [key: string]: unknown };
      confirmed: boolean;
      mobbin?: boolean;
      higgs?: boolean;
      web?: boolean;
      canVault?: boolean;
      vaultNotes?: VaultNoteForMyra[];
      vaultTasks?: { items: VaultTaskForMyra[]; summary: string };
      /** Pictures and text files added to this message; the host checks them against src/shared/askFiles.ts. */
      files?: AskFile[];
      plan?: PlanAsk;
      /** Myra's model and effort for this call; without one, or one the provider doesn't list, Claude Code uses its own
       *  default. The other calls to Claude Code take it too. */
      myraModel?: ModelChoice;
    };
    result: string;
  };
  rewrite: {
    args: { text: string; how: string; title: string; around: string; myraModel?: ModelChoice };
    result: string;
  };
  connections: { args: None; result: Connections };
  models: { args: None; result: ProviderModels[] };
  // model: the Higgsfield image model; myraModel: the one Claude Code runs on
  higgsQuote: { args: { model?: string; myraModel?: ModelChoice }; result: string };
  higgsMake: {
    args: { model?: string; style?: string; images: (ImageJob & { aspect: string })[]; myraModel?: ModelChoice };
    result: string;
  };
  drawFill: {
    args: { style?: string; images: (ImageJob & { w: number; h: number })[]; myraModel?: ModelChoice };
    result: string;
  };
  export: {
    args: { x: number; y: number; w: number; h: number; name: string; pdf: boolean; scale: number };
    result: string;
  };
  saveFile: { args: { data: string; name: string; ext: string }; result: string };
  docPDF: { args: { html: string; name: string; paper: 'a4' | 'letter' }; result: string };
  fonts: { args: None; result: string[] };
  speechAuth: { args: None; result: 'ok' | 'off' };
  transcribe: { args: { audio: string }; result: string };
  mediaBegin: { args: { ext: string }; result: string };
  mediaChunk: { args: { name: string; data: string }; result: true };
  mediaEnd: { args: { name: string }; result: string };
  // the stripped boards and the manifest that names them and their videos; the host asks where to save, streams the zip
  // there, and answers with its path, or null when they changed their mind
  zipExport: { args: { name: string; manifest: Manifest; boards: Board[] }; result: string | null };
  // a Fenmyr zip, by path when one was dropped or by the open dialog when not; null when they changed their mind
  zipImport: { args: { path?: string }; result: ImportResult | null };
  updateCheck: { args: { channel: UpdateChannel }; result: UpdateInfo };
  updatePrepare: { args: None; result: string };
  updateNow: { args: { channel: UpdateChannel }; result: 'updating' };
  // a file or folder shown in the system's file manager: the boards folder when no path is given
  reveal: { args: { path?: string }; result: true };
  openURL: { args: { url: string }; result: true };
  gitStatus: { args: { path: string }; result: GitStatus };
  gitInit: { args: { path: string }; result: GitStatus };
  // everywhere: for every repo on this computer, not only this one
  gitSetIdentity: { args: { path: string; name: string; email: string; everywhere: boolean }; result: GitStatus };
  ghStatus: { args: None; result: GhState };
  repoPick: { args: None; result: string | null };
  packageManager: { args: None; result: PackageManager | null };
  gitSetup: { args: None; result: GitSetup };
  gitSetGlobalIdentity: { args: { name: string; email: string }; result: GitIdentity };
  // answers once gh shows its one-time code; the ghLogin event says when the sign-in ends
  ghLogin: { args: None; result: { code: string; url: string } };
  ghLoginCancel: { args: None; result: true };
  ghSetupGit: { args: None; result: true };
  // a new GitHub repo for a linked folder, made by that account and set as its origin
  // a new prototype's code folder and starter files in a linked repo
  protoCreate: {
    args: { root: string; name: string; stack: 'react' | 'html' };
    result: { dir: string; stack: 'react' | 'html' };
  };
  protoCopy: { args: { fromRoot: string; dir: string; toRoot: string }; result: { dir: string; files: number } };
  protoExists: { args: { root: string; dir: string }; result: boolean };
  // the prototypes already in a repo's prototypes/ folder, named by their page's title
  protoFind: { args: { root: string }; result: { dir: string; stack: 'react' | 'html'; name: string }[] };
  protoRename: { args: { root: string; dir: string; name: string }; result: { dir: string } };
  // restored: from the last commit; fresh: starter files, since it was never committed
  protoRestore: {
    args: { root: string; dir: string; name: string; stack: 'react' | 'html' };
    result: 'restored' | 'fresh';
  };
  protoFiles: { args: { root: string; dir: string }; result: string[] };
  // a prototype's files as they were at a commit, by path inside its folder, for showing a capture again
  protoAtCommit: { args: { root: string; dir: string; commit: string }; result: Record<string, string> };
  protoRead: { args: { root: string; dir: string; file: string }; result: string };
  // a built preview, saved as a page and opened in the person's browser
  previewOpen: { args: { html: string; name: string }; result: true };
  // a built preview, kept to be served to the preview frame from an origin of its own, fenmyrpreview://
  previewPage: { args: { html: string }; result: { url: string } };
  // Myra writing a prototype's code: answers with the build's id at once, and protoBuild events follow; busy when a
  // build is already running in the repo
  protoBuild: {
    args: {
      root: string;
      dir: string;
      stack: 'react' | 'html';
      request: string;
      purpose: string;
      device: string;
      // ranked, most worth keeping first, each as the builder reads it, in JSON; the host keeps as many as the model's
      // window has room for
      cards: { id: string; text: string }[];
      errors: string;
      // what the sketches, screenshots and wireframes look like, as data: URLs, ranked as the cards are; id: the card's
      pictures: { id: string; name: string; data: string }[];
      // card ids: screens out of view, so no picture was taken; pictures too big to send; and cards past the most
      // pictures a build takes, whose picture wasn't
      unseen: string[];
      tooBig: string[];
      over: string[];
      // the renderer's names for the build and its board, which its end repeats
      build: string;
      board: string;
      myraModel?: ModelChoice;
    };
    result: { kind: 'started'; id: string } | { kind: 'busy' };
  };
  // part of the window as a PNG data: URL, for a wireframe's picture
  captureArea: { args: { x: number; y: number; w: number; h: number }; result: string };
  // when: seconds since 1970 of the last commit touching it, 0 when it has none
  protoLastChange: { args: { root: string; dir: string }; result: { branch: string; when: number; subject: string } };
  // a short explanation, in Myra's words, of how the prototype's code works now, starting with these files (paths inside
  // its folder), from a Claude Code run that can only read
  protoExplain: { args: { root: string; dir: string; files: string[]; myraModel?: ModelChoice }; result: string };
  // busy, with nothing put back, while a build runs in the repo
  protoUndo: { args: { root: string; dir: string; snapshot: string }; result: { kind: 'undone' } | { kind: 'busy' } };
  // a file of an installed package, or null when there's none by that name
  protoModule: { args: { root: string; file: string }; result: string | null };
  protoInstall: { args: { root: string; packages: string[] }; result: string[] };
  gitFetch: { args: { root: string; account: string }; result: GitStatus };
  // busy, with nothing changed, while a build runs in the repo: the pull, the commit and taking GitHub's version
  gitPull: {
    args: { root: string; account: string };
    result: { kind: 'pulled' } | { kind: 'conflict'; files: string[] } | { kind: 'busy' };
  };
  gitKeepMine: { args: { root: string; account: string; branch: string }; result: GitStatus };
  gitTakeTheirs: { args: { root: string }; result: GitStatus | { kind: 'busy' } };
  protoWriteTweaks: { args: { root: string; dir: string; json: string }; result: true };
  gitCommit: { args: { root: string; dir: string; message: string }; result: GitStatus | { kind: 'busy' } };
  // account: the gh login that reaches this project's GitHub copy, if it has one
  gitPush: { args: { root: string; account: string }; result: GitStatus };
  ghRepoCreate: {
    args: { path: string; account: string; name: string; private: boolean };
    result: { owner: string; name: string };
  };
};

export type HostEvents = {
  caelestia: CaelestiaScheme | null;
  boardsChanged: null;
  settings: null;
  ghLogin: { ok: boolean; message: string };
  protoBuild: BuildEvent;
};
