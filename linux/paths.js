// Where Myra keeps things, following the XDG base directories.
//   boards, folders, media, usage:  $XDG_DATA_HOME/myra   (~/.local/share/myra)
//   the speech model:               $XDG_DATA_HOME/myra/whisper
// The folder layout inside is the same as Mochiboard's (the Mac app this grew from, ~/Library/Application Support/Mochiboard),
// so boards copied over from it just work.
const os = require('os'), path = require('path');

const xdg = (v, fallback) => process.env[v] || path.join(os.homedir(), fallback);
const support = path.join(xdg('XDG_DATA_HOME', '.local/share'), 'myra');

module.exports = {
  support,
  boardsDir: path.join(support, 'boards'),
  mediaDir: path.join(support, 'media'),
  usageFile: path.join(support, 'usage.json'),
  foldersFile: path.join(support, 'folders.json'),
  windowFile: path.join(support, 'window.json'),
  prefsFile: path.join(support, 'prefs.json'),   // the few settings the host needs to know (the page keeps the rest)
  pendingDir: path.join(support, 'pending-update'),
  whisperDir: path.join(support, 'whisper'),
  updateLog: path.join(support, 'update.log'),
  web: path.join(__dirname, '..', 'web'),
};
