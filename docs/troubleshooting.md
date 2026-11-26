# Troubleshooting

## The window

- **Blank or flickering window on NVIDIA.** Put extra Electron flags in `~/.config/fenmyr-flags.conf`, one per line, such as `--disable-gpu-compositing` or `--ozone-platform=x11`.
- **Force Wayland or X11.** The launcher passes `--ozone-platform-hint=auto`, which picks Wayland when it's there. Add `--ozone-platform=wayland` or `--ozone-platform=x11` to the flags file to choose.
- **No close, minimise or maximise buttons.** The board fills the window with no title bar, and your compositor moves and sizes it. To get buttons, switch on Settings → Appearance → Window buttons. Three dots appear at the top left, with a strip beside them to drag the window by.

## Myra

- **Myra says she needs Claude Code, but it's installed.** Run `which claude` in a terminal and make sure that folder is one Fenmyr looks in: `~/.local/bin`, `~/.claude/local`, `/usr/bin`, `/usr/local/bin`, or the npm, nvm, volta and bun folders. Fenmyr also asks your login shell (bash, zsh or fish). If it still isn't found, symlink `claude` into `~/.local/bin`. Settings → Connections shows **ready** as soon as Fenmyr finds it.

## Camera and microphone

- **Camera or microphone not found.** Fenmyr uses the same camera and microphone as your browser, through PipeWire. Check `pavucontrol` or your sound settings, and that nothing else holds the camera.

## Theme

- **Follow Caelestia doesn't change anything.** See [Follow your Caelestia theme](caelestia.md#if-nothing-changes).

## Updates

- **Update now says your Fenmyr folder wasn't updated.** Fenmyr never touches work of your own in the folder you installed from. Stable and Beta move the clone to a release, so they stop when it has changes or commits of its own, or sits on a branch other than `main`; Every change only pulls, so it stops when the clone has diverged from GitHub. Run `./install.sh --update` in that folder to see what's in the way.
- **The update log.** An update from a clone writes what it did to `~/.local/share/fenmyr/update.log`.

## Developer tools

Press F12 or Ctrl+Shift+I.

Still stuck? [Report a bug](https://github.com/chiangs/fenmyr/issues/new/choose), with what you did, what you expected and the details from Settings → About → **Copy details**.
