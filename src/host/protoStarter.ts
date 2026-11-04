// The files a new prototype starts with, and the ones every prototype in a repo shares at its root. React prototypes
// are laid out the way Vite expects, so the README's "npm install, then npx vite prototypes/<name>" runs them anywhere.
import type { Proto } from '../shared/repos.ts';

type Files = Record<string, string>;

const react = (title: string): Files => {
  // a name like Ann's flow stays one string in the code
  const quoted = JSON.stringify(title);
  return {
    'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
`,
    'src/main.tsx': `import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);
`,
    'src/App.tsx': `export function App() {
  const title = ${quoted};
  const hint = 'Select cards on the board and ask Myra to build this flow.';
  const page = 'grid min-h-screen place-content-center gap-2 p-6 text-center';
  const heading = 'text-2xl font-semibold';
  const note = 'text-sm text-neutral-500';
  return (
    <main className={page}>
      <h1 className={heading}>{title}</h1>
      <p className={note}>{hint}</p>
    </main>
  );
}
`,
    'src/styles.css': `@import "tailwindcss";
`,
    // the prototype's controls: what they are and their saved values; Fenmyr draws the common kinds above the preview
    'src/tweaks.json': '{}\n',
    'src/tweaks.ts': `import { useSyncExternalStore } from 'react';
import saved from './tweaks.json';

// The values of the controls in tweaks.json. In Fenmyr's preview they change as the person moves a control;
// anywhere else they're the saved ones.
type Tweak = { kind: string; value: unknown };
const listeners = new Set<() => void>();
let values: Record<string, unknown> = Object.fromEntries(
  Object.entries(saved as Record<string, Tweak>).map(([key, t]) => [key, t.value]),
);
const set = (next: Record<string, unknown>) => {
  values = { ...values, ...next };
  for (const l of listeners) l();
};

addEventListener('message', e => {
  if (e.source === parent && e.data?.fenmyrTweaks) set(e.data.fenmyrTweaks);
});

export const useTweaks = () =>
  useSyncExternalStore(
    l => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => values,
  );

// for a custom control built in src/knobs/: it changes the value here and tells Fenmyr, so Keep these values saves it
export function setTweak(key: string, value: unknown) {
  set({ [key]: value });
  parent.postMessage({ fenmyrPreview: true, type: 'tweak', key, value: JSON.stringify(value) }, '*');
}

// custom controls show only in Fenmyr's preview, never in the shared prototype
export const inFenmyr = () => (globalThis as { __fenmyr?: boolean }).__fenmyr === true;
`,
  };
};

const html = (title: string): Files => ({
  'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <link rel="stylesheet" href="./style.css" />
  </head>
  <body>
    <main class="empty">
      <h1>${title}</h1>
      <p>Select cards on the board and ask Myra to build this flow.</p>
    </main>
    <script src="./script.js"></script>
  </body>
</html>
`,
  'style.css': `body { margin: 0; font-family: system-ui, sans-serif; }
.empty { min-height: 100vh; display: grid; place-content: center; text-align: center; padding: 24px; }
`,
  'script.js': '',
});

export const STARTERS: Record<Proto['stack'], (title: string) => Files> = { react, html };

// written in prototypes/ only where missing, so the repo's own versions always win and nothing lands at its root
export const SHARED_FILES = (repoName: string): Files => ({
  'package.json': `${JSON.stringify(
    {
      name: `${repoName}-prototypes`,
      private: true,
      type: 'module',
      scripts: { dev: 'vite --config vite.config.ts' },
      dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
      devDependencies: {
        '@types/react': '^19.0.0',
        '@types/react-dom': '^19.0.0',
        typescript: '^5.6.0',
        vite: '^7.0.0',
      },
    },
    null,
    2,
  )}\n`,
  'tsconfig.json': `${JSON.stringify(
    {
      compilerOptions: {
        jsx: 'react-jsx',
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
      },
    },
    null,
    2,
  )}\n`,
  '.gitignore': 'node_modules/\ndist/\n',
  'vite.config.ts': `import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({ plugins: [tailwindcss()] });
`,
  'design.md': `# Design

Myra reads this before she writes code for any prototype in this repo. Keep it short and specific.

## Colours

## Type

## Spacing and layout

## Components
`,
  'myra.md': `# How Myra works in this repo

Myra follows this for every prototype here. Change it to suit the team.

## Stack
- React with TypeScript and Tailwind CSS. No other packages unless the person installed them.
- Style with Tailwind classes. Theme values (colours, fonts) go in an @theme block in src/styles.css.
- One component per file in src/components/. App.tsx only puts them together.
- State lives in the component that owns it. No global state libraries.

## Components
- The JSX return holds no logic. Work out every value first, including text, class lists,
  conditions and lists, and give each a name. The return only puts named values in place.

      const title = 'Your basket';
      const totalText = formatTotal(total);
      const card = 'basket-card';
      const items = lines.map(line => <Line key={line.id} line={line} />);
      return <section className={card}><h2>{title}</h2>{items}<p>{totalText}</p></section>;

- No ternaries, && or .map inside the return.
- Real words from the cards, never placeholder text.
- Only the product on screen: no hints, captions or notes about the prototype itself.

## Markup and access
- Semantic HTML: real buttons and links, a label for every input, headings in order.
- Mobile first, at the prototype's device width.
`,
});
