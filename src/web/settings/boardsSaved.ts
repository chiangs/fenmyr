// The bold line on Settings, General: how many boards there are, and whether they stay on this computer or sit in a
// project linked to a remote repo. What reaches Claude or the repo is the fixed note under it in index.html.
const LOCAL = 'Locally saved';
const LINKED = 'Local files linked to a remote repo';

export function boardsSaved(boards: number, linkedProjects: number) {
  return `${boards} board${boards === 1 ? '' : 's'}, ${linkedProjects > 0 ? LINKED : LOCAL}`;
}
