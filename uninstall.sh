#!/bin/bash
# Removes Myra. Your boards and settings stay unless you say otherwise.
#   ./uninstall.sh          remove the app, then ask about your boards and settings
#   ./uninstall.sh --purge  also delete your boards and settings, without asking
#   ./uninstall.sh --yes    remove the app, keep your boards and settings, no questions
LIB="$HOME/.local/lib/myra"
DATA="${XDG_DATA_HOME:-$HOME/.local/share}/myra"
CONF="${XDG_CONFIG_HOME:-$HOME/.config}/Myra"    # Electron keeps the app's settings here (name, theme, the tour…)
PURGE=0; YES=0
for a in "$@"; do case "$a" in --purge) PURGE=1;; --yes|-y) YES=1;; esac; done

echo ""
echo "  Removing Myra…"
pkill -f "lectron[^ ]* .*$LIB/app( |$)" 2>/dev/null || true
pkill -x myra 2>/dev/null || true   # the AppImage
rm -rf "$LIB"
rm -f "$HOME/.local/bin/myra" "$HOME/.local/share/applications/myra.desktop"
for f in "$HOME"/Applications/Myra*.AppImage; do [ -e "$f" ] && rm -f "$f" && echo "  ✓ Removed $f"; done
command -v update-desktop-database >/dev/null && update-desktop-database "$HOME/.local/share/applications" >/dev/null 2>&1 || true
echo "  ✓ The app is gone."

if [ -d "$DATA" ] || [ -d "$CONF" ]; then
  if [ "$PURGE" = 1 ]; then REPLY=y
  elif [ "$YES" = 1 ]; then REPLY=n
  else
    n=$(ls "$DATA/boards" 2>/dev/null | grep -c '\.json$' || true)
    read -r -p "  Also delete your $n board(s) and settings? This can't be undone. [y/N]: " REPLY
  fi
  if [[ "$REPLY" =~ ^[Yy] ]]; then rm -rf "$DATA" "$CONF"; echo "  ✓ Boards and settings deleted."
  else echo "  Your boards are still in $DATA (reinstall any time and they'll be right there)."; fi
fi
command -v pacman >/dev/null && pacman -Q electron >/dev/null 2>&1 && echo "  (Electron stays installed, since other apps may use it. Remove it with: sudo pacman -Rs electron)"
echo ""
