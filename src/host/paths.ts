import os from 'node:os';
import path from 'node:path';

const xdg = (v: string, fallback: string) => process.env[v] || path.join(os.homedir(), fallback);
const support = path.join(xdg('XDG_DATA_HOME', '.local/share'), 'fenmyr');

export default {
  support,
  boardsDir: path.join(support, 'boards'),
  mediaDir: path.join(support, 'media'),
  vaultsFile: path.join(support, 'vaults.json'),
  templatesDir: path.join(support, 'templates'),
  usageFile: path.join(support, 'usage.json'),
  foldersFile: path.join(support, 'folders.json'),
  windowFile: path.join(support, 'window.json'),
  pendingDir: path.join(support, 'pending-update'),
  whisperDir: path.join(support, 'whisper'),
  updateLog: path.join(support, 'update.log'),
};
