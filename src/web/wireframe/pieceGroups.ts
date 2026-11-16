// What the Pieces picker and the Wireframe panel offer, by what things are.

export type GroupKey = 'basics' | 'controls' | 'blocks' | 'layouts';
/** One thing to pick: a piece, or the Box or Text tool that R and X also put in hand. */
export type Cell = { kind: 'piece'; name: string } | { kind: 'tool'; tool: 'box' | 'text'; key: 'R' | 'X' };

const pieces = (...names: string[]): Cell[] => names.map(name => ({ kind: 'piece', name }));

export const PIECE_GROUPS: readonly { key: GroupKey; heading: string; cells: readonly Cell[] }[] = [
  {
    key: 'basics',
    heading: 'Basics',
    cells: [
      { kind: 'tool', tool: 'box', key: 'R' },
      { kind: 'tool', tool: 'text', key: 'X' },
      ...pieces('Heading', 'Image', 'Video', 'Map', 'Avatar', 'Divider', 'Space'),
    ],
  },
  {
    key: 'controls',
    heading: 'Buttons and inputs',
    cells: pieces('Button', 'Input', 'Textarea', 'Search', 'Dropdown', 'Radio', 'Checkbox', 'Toggle'),
  },
  {
    key: 'blocks',
    heading: 'Building blocks',
    cells: pieces('Nav bar', 'Tab bar', 'Tabs', 'Card', 'List row', 'Table', 'Accordion', 'Modal'),
  },
  {
    key: 'layouts',
    heading: 'Layouts',
    cells: pieces(
      'Header',
      'Hero',
      'Logos',
      'Features',
      'Gallery',
      'Stats',
      'Testimonials',
      'Pricing',
      'Card grid',
      'CTA',
      'Footer',
    ),
  },
];

// other words people might type to find a piece or tool
const WORDS: Readonly<Record<string, string>> = {
  Box: 'rectangle shape draw',
  Text: 'type words label',
  Heading: 'title headline',
  Image: 'picture photo placeholder',
  Video: 'player movie clip media',
  Map: 'location pin place',
  Avatar: 'profile user person picture',
  Divider: 'line rule separator',
  Space: 'gap spacer margin padding',
  Button: 'cta action',
  Input: 'text field form',
  Textarea: 'multiline message comment form',
  Search: 'find field',
  Dropdown: 'select combobox menu picker',
  Radio: 'option choice select',
  Checkbox: 'tick check',
  Toggle: 'switch on off',
  'Nav bar': 'navigation top bar header',
  'Tab bar': 'bottom navigation tabs',
  Tabs: 'segmented tab switch',
  Card: 'tile panel',
  'List row': 'cell item list',
  Table: 'grid data rows columns spreadsheet',
  Accordion: 'faq collapse expand',
  Modal: 'dialog popup overlay sheet',
  Header: 'site navigation top',
  Hero: 'banner headline landing',
  Logos: 'brands clients partners strip',
  Features: 'benefits grid',
  Gallery: 'photos images',
  Stats: 'numbers metrics figures',
  Testimonials: 'quotes reviews customers',
  Pricing: 'plans tiers cost',
  'Card grid': 'cards grid columns',
  CTA: 'call to action button banner',
  Footer: 'links bottom',
};

/** Everything a search matches a cell on: its name and its other words, in lower case. */
export const wordsOf = (name: string) => `${name.toLowerCase()} ${WORDS[name] ?? ''}`;
