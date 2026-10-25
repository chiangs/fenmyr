// Third-party notices: everything Myra ships that other people made, with their licenses.
//   node tools/notices.js        (after `npm ci` in tools/editor, which has the bundled libraries)
// Writes THIRD-PARTY-NOTICES.md (for people reading the code) and web/licenses.js (Settings → About → Licenses).
// The bundled libraries are found by asking esbuild what goes into web/vendor/editor.js and docx.js, so the list
// can't drift from what really ships. Run it again whenever the editor bundles are rebuilt.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), ED = path.join(ROOT, 'tools', 'editor'), NM = path.join(ED, 'node_modules');
const esbuild = require(path.join(NM, 'esbuild'));

const read = f => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return null; } };
const MIT = holder => `MIT License\n\nCopyright (c) ${holder}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.`;

// ---- the libraries inside web/vendor/*.js ----
async function bundled() {
  const names = new Set();
  for (const [entry, opts] of [['entry.js', {}], ['docx-entry.js', { loader: { '.ttf': 'binary' }, define: { global: 'globalThis' } }]]) {
    const r = await esbuild.build({ entryPoints: [path.join(ED, entry)], bundle: true, write: false, metafile: true, format: 'iife', target: 'safari15', logLevel: 'silent', ...opts });
    for (const k of Object.keys(r.metafile.inputs)) { const m = k.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/); if (m) names.add(m[1]); }
  }
  // docx ships its own dependencies already bundled into its dist file, so they come along too
  const walk = p => { const j = JSON.parse(read(path.join(NM, p, 'package.json')) || '{}'); for (const d of Object.keys(j.dependencies || {})) if (!d.startsWith('@types/') && !names.has(d) && fs.existsSync(path.join(NM, d))) { names.add(d); walk(d); } };
  walk('docx');
  return [...names].sort().map(name => {
    const dir = path.join(NM, name), j = JSON.parse(read(path.join(dir, 'package.json')));
    const lf = fs.readdirSync(dir).find(f => /^licen[cs]e(\.md|\.txt)?$/i.test(f));
    const license = typeof j.license === 'string' ? j.license : (j.licenses || []).map(l => l.type).join(' OR ');
    const author = typeof j.author === 'string' ? j.author.replace(/\s*[<(].*$/, '') : j.author?.name || name;
    let text = lf ? read(path.join(dir, lf)).trim() : license === 'MIT' ? MIT(author) : `${license} (see ${j.homepage || 'the package'})`;
    if (license.startsWith('(MIT OR')) text = 'Used under the MIT License (the package is offered under MIT or GPL-3.0-or-later).\n\n' + text;
    return { name, version: j.version, license, where: 'Docs editor and Word export (web/vendor)', url: (j.homepage || (j.repository?.url || j.repository || '').toString()).replace(/^git\+/, '').replace(/\.git$/, '').replace(/^github:/, 'https://github.com/'), text };
  });
}

(async () => {
  const myraLicense = read(path.join(ROOT, 'LICENSE')).trim();
  const mochiboard = MIT('2026 Jessa Wolfe');
  const items = [
    { name: 'Mochiboard', version: '1.7.3', license: 'MIT', where: 'The canvas Myra grew from (web/, parts of linux/)', url: 'https://github.com/jessawolfe-ux/mochiboard', copyright: 'Copyright (c) 2026 Jessa Wolfe',
      note: "Myra's code is built on Mochiboard by Jessa Wolfe. Mochiboard's name, its character Mochi, its stamps, art and music are not part of Myra.", text: mochiboard },
    { name: 'Electron', version: require(path.join(ROOT, 'package.json')).devDependencies.electron, license: 'MIT', where: 'The window Myra runs in', url: 'https://www.electronjs.org',
      note: 'Electron includes Chromium and Node.js, which use many open-source licenses (BSD-style, MIT, Apache 2.0 and others). Their full texts ship with Electron as LICENSES.chromium.html, next to the Electron program; Settings → About → Licenses can open it.',
      text: (read(path.join(ROOT, 'node_modules', 'electron', 'dist', 'LICENSE')) || read(path.join(ROOT, 'node_modules', 'electron', 'LICENSE')) || MIT('Electron contributors, Copyright (c) 2013-2020 GitHub Inc.')).trim() },
    { name: 'Material Icons', version: '', license: 'Apache-2.0', where: 'Wireframe icons (web/icons)', url: 'https://fonts.google.com/icons', copyright: 'Copyright Google', text: read(path.join(ROOT, 'web', 'icons', 'LICENSE.txt')).trim() },
    { name: 'Figtree and Shantell Sans', version: '', license: 'OFL-1.1', where: 'Fonts (web/fonts)', url: 'https://openfontlicense.org', text: read(path.join(ROOT, 'web', 'fonts', 'OFL.txt')).trim() },
    ...(await bundled()),
  ];
  // THIRD-PARTY-NOTICES.md
  let md = `# Third-party notices\n\nMyra is open source under the MIT License (see [LICENSE](LICENSE)); its name, character and art are reserved (see [TRADEMARKS.md](TRADEMARKS.md)).\nIt includes software made by others, listed here with their licenses. This file is generated by \`node tools/notices.js\`.\n\n`;
  md += '| Component | Version | License | Used for |\n|---|---|---|---|\n' + items.map(i => `| ${i.url ? `[${i.name}](${i.url})` : i.name} | ${i.version || ''} | ${i.license} | ${i.where} |`).join('\n') + '\n\n';
  for (const i of items) md += `## ${i.name}${i.version ? ' ' + i.version : ''}\n\n${i.note ? i.note + '\n\n' : ''}\`\`\`\n${i.text}\n\`\`\`\n\n`;
  fs.writeFileSync(path.join(ROOT, 'THIRD-PARTY-NOTICES.md'), md);
  // web/licenses.js, loaded when someone opens the Licenses screen
  const js = `// Generated by tools/notices.js: Myra's license and every third-party notice, for Settings → About → Licenses.\nwindow.MYRA_LICENSES = ${JSON.stringify({ myra: myraLicense, items }, null, 0)};\n`;
  fs.writeFileSync(path.join(ROOT, 'web', 'licenses.js'), js);
  console.log(`${items.length} components → THIRD-PARTY-NOTICES.md and web/licenses.js`);
})();
