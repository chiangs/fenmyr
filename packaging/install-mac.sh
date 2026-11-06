#!/bin/bash
# Fenmyr installer for the Mac. install.sh runs it on a Mac, with the same options:
#   ./install.sh            build Fenmyr.app on this Mac, put it in Applications and open it
#   ./install.sh --update   get the newest version from GitHub first
#   ./install.sh --yes      no questions: installs Node.js with Homebrew if it's missing
#   ./install.sh --no-open  install without opening it
# macOS only asks about "unidentified developers" for apps that were downloaded. A copy built here wasn't,
# so it opens straight away and needs no Apple Developer ID. Your boards live in ~/.local/share/fenmyr and are never touched.
set -e
cd "$(dirname "$0")/.."
REPO="$PWD"
YES=0; OPEN=1
for a in "$@"; do case "$a" in --yes|-y) YES=1;; --no-open) OPEN=0;; esac; done
ask() { if [ "$YES" = 1 ]; then REPLY="${2:-y}"; else read -r -p "$1" REPLY || true; REPLY="${REPLY:-${2:-y}}"; fi; }
# Settings → Update now starts this from the app, whose PATH doesn't include Homebrew
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

echo ""
echo "  🫧  Installing Fenmyr…"

# --- 1. what it's built with ---
xcode-select -p >/dev/null 2>&1 || { echo "  Fenmyr needs Apple's command line tools. Run: xcode-select --install, then run ./install.sh again."; exit 1; }
if ! command -v npm >/dev/null && command -v brew >/dev/null; then
  ask "  Fenmyr is built with Node.js. Install it with Homebrew (brew install node)? [Y/n]: " y
  if [[ "$REPLY" =~ ^[Yy] ]]; then brew install node; fi
fi
command -v npm >/dev/null || { echo "  Fenmyr is built with Node.js. Install it from nodejs.org or with Homebrew (brew install node), then run ./install.sh again."; exit 1; }
[ -n "$(node -p 'process.features.typescript || ""')" ] || { echo "  Fenmyr needs Node.js 22.18 or newer (you have $(node -v)). Update it, then run ./install.sh again."; exit 1; }

# --- 2. build Fenmyr.app ---
LOG="$REPO/build/install-mac.log"
mkdir -p "$REPO/build"
fail() { echo "  $1 The details are in $LOG:"; tail -n 15 "$LOG" | sed 's/^/    /'; exit 1; }
if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  echo "  Getting what Fenmyr is built with (a few minutes the first time)…"
  npm ci --ignore-scripts --no-audit --no-fund --loglevel=error >"$LOG" 2>&1 || fail "Getting the build tools didn't work."
fi
if [ "$(uname -m)" = arm64 ]; then ARCH=arm64; else ARCH=x64; fi
echo "  Building Fenmyr for this Mac ($ARCH)…"
rm -rf build/release/mac*
{ npm run build --silent && CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dir "--$ARCH" --publish never; } >"$LOG" 2>&1 || fail "The build didn't work."
BUILT="$(ls -d build/release/mac*/Fenmyr.app | head -1)"
# where this copy came from and which commit it is, so Settings → Update now can pull, rebuild and tell what's new
printf '{ "repo": "%s", "commit": "%s" }\n' "$REPO" "$(git rev-parse HEAD 2>/dev/null || true)" > "$BUILT/Contents/Resources/install.json"
# signed last, since adding a file after signing breaks the signature
codesign --force --deep --sign - "$BUILT" >>"$LOG" 2>&1 || fail "Signing the app on this Mac didn't work."

# --- 3. into Applications ---
# replace the copy that's there; a first install goes to /Applications if you can write to it, else ~/Applications
DEST=""
for d in /Applications "$HOME/Applications"; do [ -d "$d/Fenmyr.app" ] && { DEST="$d"; break; }; done
[ -n "$DEST" ] || { if [ -w /Applications ]; then DEST=/Applications; else DEST="$HOME/Applications"; fi; }
mkdir -p "$DEST"
# let a running copy finish quitting before replacing it
if pkill -f "Fenmyr.app/Contents/MacOS/Fenmyr" 2>/dev/null; then
  for _ in $(seq 20); do pgrep -f "Fenmyr.app/Contents/MacOS/Fenmyr" >/dev/null || break; sleep 0.5; done
fi
rm -rf "$DEST/Fenmyr.app"
ditto "$BUILT" "$DEST/Fenmyr.app"

echo "  ✓ Fenmyr is installed in $DEST. Open it from Launchpad or Spotlight."
command -v claude >/dev/null || [ -x "$HOME/.local/bin/claude" ] || [ -x "$HOME/.claude/local/claude" ] || echo "  (Myra thinks with Claude Code. Install it from claude.com/claude-code so she can help on your boards.)"
command -v whisper-cli >/dev/null || command -v whisper-cpp >/dev/null || echo "  (Optional: to have voice memos written out, install whisper.cpp: brew install whisper-cpp)"

# --- 4. open it ---
if [ "$OPEN" = 1 ]; then
  open "$DEST/Fenmyr.app"
  echo "  🫧  Opening Fenmyr…"
fi
echo ""
