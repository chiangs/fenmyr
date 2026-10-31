type None = Record<string, never>;

export type Board = { id: string; [key: string]: unknown };
export type BoardSummary = {
  id: string;
  name: string;
  color: string;
  folder: string | null;
  parent: string | null;
  updated: number;
};
export type Template = { id: string; cards: unknown[]; [key: string]: unknown };

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

type UsageTotals = { asks: number; tokensIn: number; tokensOut: number; cost: number };
export type UsageSummary = { today: UsageTotals; week: UsageTotals; all: UsageTotals; since: number };

export type CaelestiaScheme = { name: string; mode: 'dark' | 'light'; colours: Record<string, string> };
export type LinkPreview = { title: string; desc: string; image: string };
export type Connections = { claude: boolean; mobbin: boolean; higgsfield: boolean };

// empty when installed some other way: the page says how to update then
export type UpdateInfo =
  | None
  | { repo: true; offline: true; since: string }
  | { repo: true; behind: number; since: string; notes: string[] }
  | { release: true; offline: true; since: string }
  | { release: true; behind: number; since: string; latest: string; notes: string[]; preview?: true };

export type Chattiness = 'quiet' | 'normal' | 'chatty';
export type MyraStyle = { name: string; chat: Chattiness; emoji: boolean };
export type SlashCommand = { cmd: string; arg?: string; desc: string; ex?: string | string[]; opts?: string[] };
export type VaultNoteForMyra = { vault: string; path: string; title: string; tags: string[]; text: string };

type ImageJob = { id: string; label: string };

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
    };
    result: string;
  };
  rewrite: { args: { text: string; how: string; title: string; around: string }; result: string };
  connections: { args: None; result: Connections };
  higgsQuote: { args: { model?: string }; result: string };
  higgsMake: { args: { model?: string; style?: string; images: (ImageJob & { aspect: string })[] }; result: string };
  drawFill: { args: { style?: string; images: (ImageJob & { w: number; h: number })[] }; result: string };
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
  updateCheck: { args: None; result: UpdateInfo };
  updatePrepare: { args: None; result: string };
  updateNow: { args: None; result: 'updating' };
  reveal: { args: None; result: true };
  openURL: { args: { url: string }; result: true };
};

export type HostEvents = { caelestia: CaelestiaScheme | null; boardsChanged: null };
