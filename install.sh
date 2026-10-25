#!/bin/bash
# Myra installer for Linux: puts the app in ~/.local, adds it to your app launcher and opens it.
#   ./install.sh            install (or reinstall) and open
#   ./install.sh --update   get the newest version from GitHub first
#   ./install.sh --yes      no questions: installs what's missing with pacman when it can
#   ./install.sh --no-open  install without opening it
# Your boards live in ~/.local/share/myra and are never touched. To remove Myra: ./uninstall.sh
set -e
cd "$(dirname "$0")"
REPO="$PWD"
LIB="$HOME/.local/lib/myra"
BIN="$HOME/.local/bin"
APPS="$HOME/.local/share/applications"
ELECTRON_VERSION="$(node -p "require('./package.json').devDependencies.electron" 2>/dev/null || sed -n 's/.*"electron": "\([0-9.]*\)".*/\1/p' package.json)"
YES=0; OPEN=1; UPDATE=0
for a in "$@"; do case "$a" in --update) UPDATE=1;; --yes|-y) YES=1;; --no-open) OPEN=0;; esac; done
ask() { if [ "$YES" = 1 ]; then REPLY="${2:-y}"; else read -r -p "$1" REPLY || true; REPLY="${REPLY:-${2:-y}}"; fi; }

if [ "$UPDATE" = 1 ]; then echo "  Getting the newest Myra…"; git pull --ff-only; fi

echo ""
echo "  🫧  Installing Myra…"

# --- 1. Electron (the window Myra runs in) ---
# Arch and CachyOS: the system's electron package, kept up to date by pacman. Anywhere else (or if you'd rather not): a private copy from npm.
ELECTRON=""
if command -v electron >/dev/null; then ELECTRON="$(command -v electron)"
elif command -v pacman >/dev/null; then
  ask "  Myra runs in Electron. Install it with pacman (sudo pacman -S electron)? [Y/n]: " y
  if [[ "$REPLY" =~ ^[Yy] ]]; then sudo pacman -S --needed --noconfirm electron && ELECTRON="$(command -v electron)"; fi
fi
if [ -z "$ELECTRON" ]; then
  if [ -x "$LIB/electron/node_modules/electron/dist/electron" ]; then ELECTRON="$LIB/electron/node_modules/electron/dist/electron"
  elif command -v npm >/dev/null; then
    echo "  Getting Electron $ELECTRON_VERSION (about 100 MB, once)…"
    mkdir -p "$LIB/electron"
    ( cd "$LIB/electron" && npm install --no-audit --no-fund --loglevel=error "electron@$ELECTRON_VERSION" >/dev/null \
      && { [ -x node_modules/electron/dist/electron ] || node node_modules/electron/install.js; } )   # newer Electrons fetch the binary on first use; get it now
    ELECTRON="$LIB/electron/node_modules/electron/dist/electron"
  else
    echo "  Myra needs Electron. Install it (Arch: sudo pacman -S electron) or Node.js/npm, then run ./install.sh again."; exit 1
  fi
fi
command -v fc-list >/dev/null || echo "  (fontconfig isn't installed, so Myra won't list your fonts: sudo pacman -S fontconfig)"

# --- 2. the app itself ---
# Myra used to be "Mochiboard for Linux": take that app out (its boards and settings move into Myra the first time Myra opens)
OLD="$HOME/.local/lib/mochiboard"
if [ -d "$OLD" ]; then
  pkill -f "lectron[^ ]* .*$OLD/app( |$)" 2>/dev/null && sleep 1 || true
  rm -rf "$OLD" "$HOME/.local/bin/mochiboard" "$APPS/mochiboard.desktop"
  echo "  ✓ Took out Mochiboard for Linux (your boards come along into Myra)"
fi
pkill -f "lectron[^ ]* .*$LIB/app( |$)" 2>/dev/null && sleep 1 || true   # let the old one finish quitting before replacing it
rm -rf "$LIB/app"; mkdir -p "$LIB/app/assets"
cp -R linux web package.json LICENSE "$LIB/app/"
cp assets/icon.png "$LIB/app/assets/icon.png"
# remember where this copy came from, so Settings → Update now can pull and reinstall from here
printf '{ "repo": "%s", "electron": "%s" }\n' "$REPO" "$ELECTRON" > "$LIB/app/install.json"

# --- 3. a command, and an entry in your app launcher ---
mkdir -p "$BIN" "$APPS"
cat > "$BIN/myra" <<SH
#!/bin/sh
# Myra (installed by $REPO/install.sh). Extra Electron flags, one per line, go in ~/.config/myra-flags.conf
FLAGS=""
[ -f "\${XDG_CONFIG_HOME:-\$HOME/.config}/myra-flags.conf" ] && FLAGS="\$(grep -v '^\s*#' "\${XDG_CONFIG_HOME:-\$HOME/.config}/myra-flags.conf")"
exec "$ELECTRON" --ozone-platform-hint=auto \$FLAGS "$LIB/app" "\$@"
SH
chmod +x "$BIN/myra"
sed -e "s#^Exec=.*#Exec=$BIN/myra %U#" -e "s#^Icon=.*#Icon=$LIB/app/assets/icon.png#" packaging/myra.desktop > "$APPS/myra.desktop"
command -v update-desktop-database >/dev/null && update-desktop-database "$APPS" >/dev/null 2>&1 || true

echo "  ✓ Myra is installed. Open it from your app launcher, or run: myra"
case ":$PATH:" in *":$BIN:"*) ;; *) echo "  (~/.local/bin isn't on your PATH, so run it as $BIN/myra or add that folder to PATH)";; esac
command -v claude >/dev/null || [ -x "$HOME/.local/bin/claude" ] || [ -x "$HOME/.claude/local/claude" ] || echo "  (Myra thinks with Claude Code. Install it from claude.com/claude-code so she can help on your boards.)"
command -v whisper-cli >/dev/null || command -v whisper-cpp >/dev/null || echo "  (Optional: to have voice memos written out, install whisper.cpp, e.g. yay -S whisper.cpp)"

# --- 4. open it ---
if [ "$OPEN" = 1 ] && { [ -n "$WAYLAND_DISPLAY" ] || [ -n "$DISPLAY" ]; }; then
  nohup "$BIN/myra" >/dev/null 2>&1 &
  echo "  🫧  Opening Myra…"
fi
echo ""
