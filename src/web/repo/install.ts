import type { PackageManager } from '../../shared/ops.ts';

// The one command that installs each tool here. On a Mac, git comes with Apple's command line tools.
const COMMANDS: Record<'git' | 'gh', Record<PackageManager, string>> = {
  git: {
    pacman: 'sudo pacman -S git',
    apt: 'sudo apt install git',
    dnf: 'sudo dnf install git',
    zypper: 'sudo zypper install git',
    brew: 'xcode-select --install',
  },
  gh: {
    pacman: 'sudo pacman -S github-cli',
    apt: 'sudo apt install gh',
    dnf: 'sudo dnf install gh',
    zypper: 'sudo zypper install gh',
    brew: 'brew install gh',
  },
};

export async function installCommand(tool: 'git' | 'gh') {
  const pm = await Fenmyr.packageManager().catch(() => null);
  return pm ? COMMANDS[tool][pm] : null;
}
