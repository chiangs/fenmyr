// Writing a prototype's code is one call of this shape: a folder to work in and what to do there, file edits reported
// as they happen, and a short explanation at the end. Claude Code is the one behind it today (claudeCode.ts); another
// model only needs a function of the same shape.
type CodeJob = { cwd: string; prompt: string };
export type CodeAgent = (job: CodeJob, edited: (file: string) => void) => Promise<string>;
