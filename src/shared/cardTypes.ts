// The one place facts about each kind of card live.
type Traits = {
  label?: string;
  size?: readonly [width: number, height: number];
  wordy?: boolean; // its words can drop into a doc
  fillable?: boolean; // the selection bar offers a fill colour
  sized?: boolean; // the selection bar offers a text size
  strokable?: boolean; // can have an outline
  wireframe?: boolean; // a piece of a wireframe
  noRotate?: boolean;
  noTilt?: boolean;
  notInTemplates?: boolean; // holds media or a link to something outside the board
};

const CARD_TYPES = {
  note: { label: 'Note', size: [220, 140], wordy: true, fillable: true, sized: true },
  todo: { label: 'Checklist', size: [240, 180], wordy: true, fillable: true, sized: true },
  title: { label: 'Title', size: [320, 50], wordy: true, sized: true, strokable: true },
  image: { label: 'Picture', size: [260, 220] },
  link: { label: 'Link', size: [260, 210], wordy: true, fillable: true },
  swatch: { label: 'Colour', size: [120, 150], wordy: true },
  coll: { label: 'Collection', size: [288, 200], sized: true, noRotate: true, noTilt: true },
  doc: { label: 'Doc', size: [240, 52], wordy: true, notInTemplates: true },
  canvas: { label: 'Canvas', size: [260, 180], notInTemplates: true },
  shape: { label: 'Shape', size: [160, 160], wordy: true, sized: true, strokable: true },
  stamp: { label: 'Stamp', size: [56, 56] },
  audio: { label: 'Voice memo', size: [290, 150], wordy: true, notInTemplates: true },
  video: { label: 'Video', size: [360, 246], notInTemplates: true },
  spotify: { label: 'Spotify', wordy: true, notInTemplates: true },
  ink: { size: [10, 10], noRotate: true, noTilt: true },
  frame: { label: 'Frame', size: [393, 852], strokable: true, wireframe: true, noRotate: true, noTilt: true },
  section: { label: 'Section', noRotate: true, noTilt: true },
  box: { size: [160, 100], strokable: true, wireframe: true, noTilt: true },
  text: { size: [220, 24], strokable: true, wireframe: true, noTilt: true },
  icon: { label: 'Icon', size: [28, 28], strokable: true, wireframe: true, noTilt: true },
  font: { label: 'Font', size: [300, 210] },
  vnote: { label: 'Vault note', size: [300, 270], fillable: true, sized: true, notInTemplates: true },
  path: { strokable: true },
} as const satisfies Record<string, Traits>;

export type CardType = keyof typeof CARD_TYPES;

const DEFAULT_SIZE = [220, 140] as const;
const traits = (type: string): Traits => (Object.hasOwn(CARD_TYPES, type) ? Reflect.get(CARD_TYPES, type) : {});

export const sizeOf = (type: string) => traits(type).size ?? DEFAULT_SIZE;
export const labelOf = (type: string) => traits(type).label ?? type;
export const typesWith = (trait: Exclude<keyof Traits, 'label' | 'size'>) =>
  Object.keys(CARD_TYPES).filter(type => traits(type)[trait]);
