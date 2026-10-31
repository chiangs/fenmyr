#!/bin/bash
# Fenmyr installer for Linux: puts the app in ~/.local, adds it to your app launcher and opens it.
#   ./install.sh            install (or reinstall) and open
#   ./install.sh --update   get the newest version from GitHub first
#   ./install.sh --yes      no questions: installs what's missing with pacman when it can
#   ./install.sh --no-open  install without opening it
# Your boards live in ~/.local/share/fenmyr and are never touched. To remove Fenmyr: ./uninstall.sh
set -e
cd "$(dirname "$0")"
REPO="$PWD"
LIB="$HOME/.local/lib/fenmyr"
BIN="$HOME/.local/bin"
APPS="$HOME/.local/share/applications"
ELECTRON_VERSION="$(node -p "require('./package.json').devDependencies.electron" 2>/dev/null || sed -n 's/.*"electron": "\([0-9.]*\)".*/\1/p' package.json)"
YES=0; OPEN=1; UPDATE=0
for a in "$@"; do case "$a" in --update) UPDATE=1;; --yes|-y) YES=1;; --no-open) OPEN=0;; esac; done
ask() { if [ "$YES" = 1 ]; then REPLY="${2:-y}"; else read -r -p "$1" REPLY || true; REPLY="${REPLY:-${2:-y}}"; fi; }

if [ "$UPDATE" = 1 ]; then echo "  Getting the newest Fenmyr…"; git pull --ff-only; fi

echo ""
echo "  🫧  Installing Fenmyr…"

# --- 1. Electron (the window Fenmyr runs in) ---
# Arch and CachyOS: the system's electron package, kept up to date by pacman. Anywhere else (or if you'd rather not): a private copy from npm.
ELECTRON=""
if command -v electron >/dev/null; then ELECTRON="$(command -v electron)"
elif command -v pacman >/dev/null; then
  ask "  Fenmyr runs in Electron. Install it with pacman (sudo pacman -S electron)? [Y/n]: " y
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
    echo "  Fenmyr needs Electron. Install it (Arch: sudo pacman -S electron) or Node.js/npm, then run ./install.sh again."; exit 1
  fi
fi
command -v fc-list >/dev/null || echo "  (fontconfig isn't installed, so Fenmyr won't list your fonts: sudo pacman -S fontconfig)"

# --- 2. build it ---
if ! command -v npm >/dev/null && command -v pacman >/dev/null; then
  ask "  Fenmyr is built with Node.js and npm. Install them with pacman (sudo pacman -S nodejs npm)? [Y/n]: " y
  if [[ "$REPLY" =~ ^[Yy] ]]; then sudo pacman -S --needed --noconfirm nodejs npm; fi
fi
command -v npm >/dev/null || { echo "  Fenmyr is built with Node.js and npm. Install them (Arch: sudo pacman -S nodejs npm), then run ./install.sh again."; exit 1; }
echo "  Building Fenmyr…"
# a working copy with the developer tools builds with those; anywhere else, only the build's own packages are fetched
[ -d node_modules/typescript ] || npm ci --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error >/dev/null
npm run build --silent

# --- 3. the app itself ---
pkill -f "lectron[^ ]* .*$LIB/app( |$)" 2>/dev/null && sleep 1 || true   # let the old one finish quitting before replacing it
rm -rf "$LIB/app"; mkdir -p "$LIB/app/assets"
cp -R dist web package.json LICENSE THIRD-PARTY-NOTICES.md "$LIB/app/"
cp assets/icon.png "$LIB/app/assets/icon.png"
# remember where this copy came from, so Settings → Update now can pull and reinstall from here
printf '{ "repo": "%s", "electron": "%s" }\n' "$REPO" "$ELECTRON" > "$LIB/app/install.json"

# --- 4. a command, and an entry in your app launcher ---
mkdir -p "$BIN" "$APPS"
cat > "$BIN/fenmyr" <<SH
#!/bin/sh
# Fenmyr (installed by $REPO/install.sh). Extra Electron flags, one per line, go in ~/.config/fenmyr-flags.conf
FLAGS=""
[ -f "\${XDG_CONFIG_HOME:-\$HOME/.config}/fenmyr-flags.conf" ] && FLAGS="\$(grep -v '^\s*#' "\${XDG_CONFIG_HOME:-\$HOME/.config}/fenmyr-flags.conf")"
exec "$ELECTRON" --ozone-platform-hint=auto \$FLAGS "$LIB/app" "\$@"
SH
chmod +x "$BIN/fenmyr"
sed -e "s#^Exec=.*#Exec=$BIN/fenmyr %U#" -e "s#^Icon=.*#Icon=$LIB/app/assets/icon.png#" packaging/fenmyr.desktop > "$APPS/fenmyr.desktop"
command -v update-desktop-database >/dev/null && update-desktop-database "$APPS" >/dev/null 2>&1 || true

echo "  ✓ Fenmyr is installed. Open it from your app launcher, or run: fenmyr"
case ":$PATH:" in *":$BIN:"*) ;; *) echo "  (~/.local/bin isn't on your PATH, so run it as $BIN/fenmyr or add that folder to PATH)";; esac
command -v claude >/dev/null || [ -x "$HOME/.local/bin/claude" ] || [ -x "$HOME/.claude/local/claude" ] || echo "  (Myra thinks with Claude Code. Install it from claude.com/claude-code so she can help on your boards.)"
command -v whisper-cli >/dev/null || command -v whisper-cpp >/dev/null || echo "  (Optional: to have voice memos written out, install whisper.cpp, e.g. yay -S whisper.cpp)"

# --- 5. open it ---
if [ "$OPEN" = 1 ] && { [ -n "$WAYLAND_DISPLAY" ] || [ -n "$DISPLAY" ]; }; then
  nohup "$BIN/fenmyr" >/dev/null 2>&1 &
  echo "  🫧  Opening Fenmyr…"
fi
echo ""
