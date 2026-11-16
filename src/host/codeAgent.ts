// Writing a prototype's code is one call of this shape: a folder to work in and what to do there, file edits reported
// as they happen, and a short explanation at the end. Claude Code is the one behind it today (claudeCode.ts); another
// model only needs a function of the same shape.
// readable: other folders it may read, such as the pictures of the cards for this build. access: 'read' for a run that
// only reads the code, such as Explain the code, which must not be able to change a file
type CodeJob = { cwd: string; prompt: string; readable: string[]; access: 'edit' | 'read' };
export type CodeAgent = (job: CodeJob, edited: (file: string) => void) => Promise<string>;
