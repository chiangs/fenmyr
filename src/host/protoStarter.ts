// The files a new prototype starts with, and the ones every prototype in a repo shares at its root. React prototypes
// are laid out the way Vite expects, so the README's "npm install, then npx vite prototypes/<name>" runs them anywhere.
import type { Proto } from '../shared/model.ts';

type Files = Record<string, string>;

const react = (title: string): Files => ({
  'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <link rel="stylesheet" href="./src/styles.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
`,
  'src/main.tsx': `import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<App />);
`,
  'src/App.tsx': `export function App() {
  return (
    <main className="empty">
      <h1>${title}</h1>
      <p>Select cards on the board and ask Myra to build this flow.</p>
    </main>
  );
}
`,
  'src/styles.css': `body { margin: 0; font-family: system-ui, sans-serif; }
.empty { min-height: 100vh; display: grid; place-content: center; text-align: center; padding: 24px; }
`,
});

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

// written only where missing, so a repo's own versions always win
export const ROOT_FILES = (repoName: string): Files => ({
  'package.json': `${JSON.stringify(
    {
      name: repoName,
      private: true,
      type: 'module',
      scripts: { dev: 'vite' },
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
  'design.md': `# Design

Myra reads this before she writes code for any prototype in this repo. Keep it short and specific.

## Colours

## Type

## Spacing and layout

## Components
`,
  'myra.md': `# How Myra works in this repo

Anything Myra should always do here: naming, accessibility, patterns to follow or avoid.
`,
});
