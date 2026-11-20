// What Settings says about where boards are kept. Boards are files on this computer, but two things carry their contents
// further: Myra's prompt, which holds the open board and the names in the library, goes to Claude; and a project
// linked to a repo holds its prototypes' code, which Claude writes from the cards' words and which a push shares.
const MYRA =
  'When you ask Myra for something, she sends Claude the board you have open and the names of your boards, folders and projects.';
const REPO =
  'Prototypes in a project linked to a repo keep their code in that repo, and it can use words from your cards, so pushing the repo shares them.';

export function boardsSaved(boards: number, linkedProjects: number) {
  const count = `${boards} board${boards === 1 ? '' : 's'}, kept on this computer.`;
  return linkedProjects > 0 ? `${count} ${MYRA} ${REPO}` : `${count} ${MYRA}`;
}
