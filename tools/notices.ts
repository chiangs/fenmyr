// Writes THIRD-PARTY-NOTICES.md and web/licenses.js (Settings → About → Licenses). The bundled libraries come from asking
// esbuild what goes into web/vendor/editor.js and docx.js, so the list matches what ships. Needs `npm ci` in tools/editor.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

type Item = {
  name: string;
  version: string;
  license: string;
  where: string;
  url: string;
  text: string;
  copyright?: string;
  note?: string;
};
type Pkg = {
  version: string;
  license: string;
  author: string;
  homepage: string;
  repository: string;
  dependencies: string[];
};

const ROOT = path.resolve(import.meta.dirname, '..');
const ED = path.join(ROOT, 'tools', 'editor');
const NM = path.join(ED, 'node_modules');
// the esbuild the editor bundles are built with, so the inputs match theirs
const esbuild: typeof import('esbuild') = createRequire(path.join(ED, 'package.json'))('esbuild');

const read = (f: string) => {
  try {
    return fs.readFileSync(f, 'utf8');
  } catch {
    return null;
  }
};
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown) => (typeof v === 'string' ? v : '');

function pkg(dir: string): Pkg {
  const raw: unknown = JSON.parse(read(path.join(dir, 'package.json')) ?? '{}');
  const o = isRecord(raw) ? raw : {};
  const licenses = Array.isArray(o.licenses) ? o.licenses.map(l => (isRecord(l) ? text(l.type) : '')).join(' OR ') : '';
  return {
    version: text(o.version),
    license: typeof o.license === 'string' ? o.license : licenses,
    author: isRecord(o.author) ? text(o.author.name) : text(o.author).replace(/\s*[<(].*$/, ''),
    homepage: text(o.homepage),
    repository: isRecord(o.repository) ? text(o.repository.url) : text(o.repository),
    dependencies: isRecord(o.dependencies) ? Object.keys(o.dependencies) : [],
  };
}

const MIT = (holder: string) =>
  `MIT License\n\nCopyright (c) ${holder}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.`;

async function bundled(): Promise<Item[]> {
  const names = new Set<string>();
  const entries = [
    ['entry.js', {}],
    ['docx-entry.js', { loader: { '.ttf': 'binary' }, define: { global: 'globalThis' } }],
  ] as const;
  for (const [entry, opts] of entries) {
    const r = await esbuild.build({
      entryPoints: [path.join(ED, entry)],
      bundle: true,
      write: false,
      metafile: true,
      format: 'iife',
      target: 'safari15',
      logLevel: 'silent',
      ...opts,
    });
    for (const k of Object.keys(r.metafile.inputs)) {
      const name = k.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1];
      if (name) names.add(name);
    }
  }
  // docx ships its own dependencies already bundled into its dist file, so they come along too
  const walk = (p: string) => {
    for (const d of pkg(path.join(NM, p)).dependencies)
      if (!d.startsWith('@types/') && !names.has(d) && fs.existsSync(path.join(NM, d))) {
        names.add(d);
        walk(d);
      }
  };
  walk('docx');
  return [...names].sort().map(name => {
    const dir = path.join(NM, name);
    const j = pkg(dir);
    const licenseFile = fs.readdirSync(dir).find(f => /^licen[cs]e(\.md|\.txt)?$/i.test(f));
    const fileText = licenseFile ? read(path.join(dir, licenseFile))?.trim() : undefined;
    const fallback = j.license === 'MIT' ? MIT(j.author || name) : `${j.license} (see ${j.homepage || 'the package'})`;
    const body = fileText ?? fallback;
    const dual = j.license.startsWith('(MIT OR');
    const url = (j.homepage || j.repository)
      .replace(/^git\+/, '')
      .replace(/\.git$/, '')
      .replace(/^github:/, 'https://github.com/');
    return {
      name,
      version: j.version,
      license: j.license,
      where: 'Docs editor and Word export (web/vendor)',
      url,
      text: dual
        ? `Used under the MIT License (the package is offered under MIT or GPL-3.0-or-later).\n\n${body}`
        : body,
    };
  });
}

const must = (f: string) => {
  const t = read(f);
  if (t === null) throw new Error(`missing ${path.relative(ROOT, f)}`);
  return t.trim();
};
const devDependencies = (() => {
  const raw: unknown = JSON.parse(must(path.join(ROOT, 'package.json')));
  return isRecord(raw) && isRecord(raw.devDependencies) ? raw.devDependencies : {};
})();

const electronLicense =
  read(path.join(ROOT, 'node_modules', 'electron', 'dist', 'LICENSE')) ??
  read(path.join(ROOT, 'node_modules', 'electron', 'LICENSE')) ??
  MIT('Electron contributors, Copyright (c) 2013-2020 GitHub Inc.');
const items: Item[] = [
  {
    name: 'Mochiboard',
    version: '1.7.3',
    license: 'MIT',
    where: 'The canvas Fenmyr grew from (web/, parts of src/host/)',
    url: 'https://github.com/jessawolfe-ux/mochiboard',
    copyright: 'Copyright (c) 2026 Jessa Wolfe',
    note: "Fenmyr's code is built on Mochiboard by Jessa Wolfe. Mochiboard's name, its character Mochi, its stamps, art and music are not part of Fenmyr.",
    text: MIT('2026 Jessa Wolfe'),
  },
  {
    name: 'Electron',
    version: text(devDependencies.electron),
    license: 'MIT',
    where: 'The window Fenmyr runs in',
    url: 'https://www.electronjs.org',
    note: 'Electron includes Chromium and Node.js, which use many open-source licenses (BSD-style, MIT, Apache 2.0 and others). Their full texts ship with Electron as LICENSES.chromium.html, next to the Electron program; Settings → About → Licenses can open it.',
    text: electronLicense.trim(),
  },
  {
    name: 'Phosphor Icons',
    version: pkg(path.join(ROOT, 'node_modules', '@phosphor-icons', 'core')).version,
    license: 'MIT',
    where: "Every icon in the app that is not one of Fenmyr's or Myra's own (web/icons/pack.js is built from it)",
    url: 'https://phosphoricons.com',
    copyright: 'Copyright (c) 2023 Phosphor Icons',
    text: must(path.join(ROOT, 'node_modules', '@phosphor-icons', 'core', 'LICENSE')),
  },
  {
    name: 'Figtree and Shantell Sans',
    version: '',
    license: 'OFL-1.1',
    where: 'Fonts (web/fonts)',
    url: 'https://openfontlicense.org',
    text: must(path.join(ROOT, 'web', 'fonts', 'OFL.txt')),
  },
  ...(await bundled()),
];

const row = (i: Item) => {
  const name = i.url ? `[${i.name}](${i.url})` : i.name;
  return `| ${name} | ${i.version} | ${i.license} | ${i.where} |`;
};
const section = (i: Item) => {
  const version = i.version ? ` ${i.version}` : '';
  const note = i.note ? `${i.note}\n\n` : '';
  return `## ${i.name}${version}\n\n${note}\`\`\`\n${i.text}\n\`\`\`\n\n`;
};
const md = `# Third-party notices\n\nFenmyr is open source under the MIT License (see [LICENSE](LICENSE)); its name, Myra the character and her art are reserved (see [TRADEMARKS.md](TRADEMARKS.md)).\nIt includes software made by others, listed here with their licenses. This file is generated by \`npm run notices\`.\n\n| Component | Version | License | Used for |\n|---|---|---|---|\n${items.map(row).join('\n')}\n\n${items.map(section).join('')}`;
fs.writeFileSync(path.join(ROOT, 'THIRD-PARTY-NOTICES.md'), md);
const licenses = JSON.stringify({ fenmyr: must(path.join(ROOT, 'LICENSE')), items }, null, 0);
fs.writeFileSync(
  path.join(ROOT, 'web', 'licenses.js'),
  `// Generated by tools/notices.ts: Fenmyr's license and every third-party notice, for Settings → About → Licenses.\nwindow.FENMYR_LICENSES = ${licenses};\n`,
);
console.log(`${items.length} components → THIRD-PARTY-NOTICES.md and web/licenses.js`);
