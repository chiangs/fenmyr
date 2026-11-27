# Installing Fenmyr

The [README](../README.md#install) has the short version. This page has every way in, the installer's options, how updates work for each, and how to remove Fenmyr.

## What you need

- **Linux**. Fenmyr is made for Arch and CachyOS on Wayland, and runs on Hyprland, KDE Plasma, GNOME, Sway and niri. Or a **Mac**, Apple Silicon or Intel.
- **Node.js 22.18 or newer** and npm, to install from the code. The installer offers to install them with pacman, or with Homebrew on a Mac.
- **FUSE 2** for the AppImage, which is built for x86-64 (`sudo pacman -S fuse2` on Arch).
- **[Claude Code](https://docs.claude.com/en/docs/claude-code)**, signed in, for Myra and prototyping. Without it, the canvas works and Myra's AI parts don't. See [Connections](../README.md#connections).

## From the code (Linux)

```bash
git clone https://github.com/chiangs/fenmyr.git
cd fenmyr
./install.sh
```

The installer:

1. Finds Electron. It uses Arch's `electron` package and offers to install it. On other distros, or if you say no, it downloads a private copy.
2. Builds Fenmyr with Node.js and npm, and offers to install them with pacman if they're missing.
3. Puts Fenmyr in `~/.local/lib/fenmyr`, the `fenmyr` command in `~/.local/bin`, and an entry in your app launcher.
4. Opens Fenmyr. The first time, Myra walks you through setup and a short tour.

### Installer options

| | |
|---|---|
| `./install.sh --update` | Get the newest version from GitHub first |
| `./install.sh --update --to v1.1.0` | Move to that release instead (what **Update now** does on Stable and Beta) |
| `./install.sh --yes` | No questions: installs what's missing with pacman (Homebrew on a Mac) when it can |
| `./install.sh --no-open` | Install without opening it |

## AppImage (Linux)

**[Download the latest AppImage](https://github.com/chiangs/fenmyr/releases/latest)** (`Fenmyr-x86_64.AppImage`).

```bash
chmod +x Fenmyr-x86_64.AppImage
./Fenmyr-x86_64.AppImage
```

To add it to your app launcher, use [Gear Lever](https://flathub.org/apps/it.mijorus.gearlever) or AppImageLauncher, or keep it in `~/Applications`.

## Mac

Fenmyr isn't signed with a paid Apple Developer ID, so macOS is wary of a downloaded copy. A copy you build on your own Mac isn't marked as downloaded, so it opens with no warning. That's the recommended way.

### Build it on your Mac (recommended)

```bash
xcode-select --install    # once, if you don't have Apple's command line tools yet
git clone https://github.com/chiangs/fenmyr.git
cd fenmyr
./install.sh
```

The installer:

1. Checks for Node.js 22.18 or newer, and offers to install it with Homebrew (`brew install node`).
2. Builds `Fenmyr.app` for your Mac, Apple Silicon or Intel. The first build takes a few minutes, since it downloads Electron and the build tools.
3. Puts it in `/Applications`, or in `~/Applications` if you can't write to `/Applications`.
4. Opens it.

The options are the same as on Linux.

### A downloaded .dmg

If someone sent you a `.dmg` (the **Mac build** in the Actions tab makes one), drag Fenmyr to Applications. The first time you open it, macOS says it can't check Fenmyr for malicious software, or that Fenmyr is damaged. It isn't: that's how macOS treats any app that isn't signed with a paid Apple Developer ID. To open it, do one of these once:

- Open it, close the warning, then go to **System Settings → Privacy & Security**, scroll down and click **Open Anyway**. On macOS 14 and earlier you can instead right-click Fenmyr in Applications and choose **Open**, then **Open** again.
- Or, in Terminal, run `xattr -cr /Applications/Fenmyr.app`. This also fixes the "damaged" message.

A copy from a `.dmg` doesn't update itself. To get updates, build it on your Mac as above.

## Updates

| Installed with | How it updates | Channels |
|---|---|---|
| `install.sh` (Linux or Mac) | A dot shows on the ⚙ when a new version is ready, and Settings → About lists what's new with **Update now**. That pulls from GitHub, rebuilds, reinstalls and reopens, and doesn't touch your boards. Or run `./install.sh --update`. | Stable, Beta or Every change |
| AppImage | Say yes once, and new versions download in the background and install when you quit. | Stable only |
| `.dmg` | Doesn't update. | – |

Choose the channel in **Settings → About → Channel**:

- **Stable**: tested releases.
- **Beta**: new things early, with some rough edges. Stable releases come too.
- **Every change**: each change as it's merged into `main`. For people working on Fenmyr.

## Uninstall

```bash
./uninstall.sh            # removes the app, then asks before touching your boards
./uninstall.sh --purge    # also deletes your boards and settings
./uninstall.sh --yes      # removes the app and keeps your boards and settings, no questions
```

It removes everything `install.sh` added, any `~/Applications/Fenmyr*.AppImage`, and `Fenmyr.app` from `/Applications` or `~/Applications` on a Mac. Electron from pacman stays, since other apps may use it. To remove it, run `sudo pacman -Rs electron`.
