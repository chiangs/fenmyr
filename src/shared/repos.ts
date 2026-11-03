import type { Project } from './model.ts';

const within = (path: string, root: string) => path === root || path.startsWith(root.endsWith('/') ? root : `${root}/`);

// Another project using this repo, or a repo inside or around it. Two projects in one repo would commit each other's work.
export const repoClash = (projects: Project[], self: string, root: string): Project | null =>
  projects.find(p => p.id !== self && p.repo && (within(root, p.repo.path) || within(p.repo.path, root))) ?? null;
