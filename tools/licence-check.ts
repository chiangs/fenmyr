// Fails when Fenmyr's own licence is named differently in two places: package.json, LICENSE, NOTICE, the words that
// name it, and the two generated files. The licence is stated at the root only, with no line in each source file, so
// this is what keeps them in step. Relicensing means changing ID and TITLE here on purpose, then what this lists.
import fs from 'node:fs';
import path from 'node:path';

const ID = 'EUPL-1.2';
const TITLE = 'EUROPEAN UNION PUBLIC LICENCE v. 1.2';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const problems: string[] = [];
const expect = (ok: boolean, file: string, why: string) => {
  if (!ok) problems.push(`${file}: ${why}`);
};

const pkg: unknown = JSON.parse(read('package.json'));
const build = isRecord(pkg) && isRecord(pkg.build) ? pkg.build : {};
const shipped = Array.isArray(build.files) ? build.files : [];
expect(isRecord(pkg) && pkg.license === ID, 'package.json', `"license" must be ${ID}`);
for (const file of ['LICENSE', 'NOTICE'])
  expect(shipped.includes(file), 'package.json', `build.files must list ${file}, so the packaged app carries it`);
expect(
  read('install.sh')
    .split('\n')
    .some(line => /\bLICENSE\b/.test(line) && /\bNOTICE\b/.test(line)),
  'install.sh',
  'must copy LICENSE and NOTICE into the installed app',
);

const licence = read('LICENSE').trim();
const notice = read('NOTICE').trim();
expect(licence.split('\n')[0]?.trim() === TITLE, 'LICENSE', `must start with the title "${TITLE}"`);
expect(notice.includes('Licensed under the EUPL'), 'NOTICE', 'must say "Licensed under the EUPL"');
expect(notice.includes(`(${ID})`), 'NOTICE', `must name the licence as (${ID})`);

for (const file of ['README.md', 'TRADEMARKS.md', 'CONTRIBUTING.md'])
  expect(read(file).includes(ID), file, `must name the licence as ${ID}`);
expect(read('web/index.html').includes(`Free and open source (${ID})`), 'web/index.html', `About must say (${ID})`);

const generated = 'run `npm run notices` and commit both files';
expect(
  read('THIRD-PARTY-NOTICES.md').includes(`Fenmyr is open source under the ${ID} (`),
  'THIRD-PARTY-NOTICES.md',
  `its first paragraph must name ${ID}; ${generated}`,
);
const script = read('web/licenses.js').match(/^window\.FENMYR_LICENSES = (.*);$/m);
const data: unknown = script?.[1] ? JSON.parse(script[1]) : null;
const own = isRecord(data) && typeof data.fenmyr === 'string' ? data.fenmyr : '';
expect(isRecord(data) && data.fenmyrLicense === ID, 'web/licenses.js', `fenmyrLicense must be ${ID}; ${generated}`);
expect(
  own.includes(notice) && own.includes(licence) && own.indexOf(notice) < own.indexOf(licence),
  'web/licenses.js',
  `Fenmyr's text must be NOTICE, then LICENSE, as they are now; ${generated}`,
);

for (const p of problems) console.log(`licence: ${p}`);
if (problems.length) process.exit(1);
