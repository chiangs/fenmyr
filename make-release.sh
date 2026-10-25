#!/bin/bash
# Builds the Myra AppImage and publishes it as a GitHub Release.
#   ./make-release.sh          build + publish the version in package.json
#   ./make-release.sh --dry    build the AppImage only (build/release/)
#   ./make-release.sh --arm64  also build for 64-bit ARM
# People download it from https://github.com/chiangs/myra/releases/latest
# The AppImage updates itself from those releases (linux/update.js looks for Myra-<arch>.AppImage).
set -e
cd "$(dirname "$0")"
V="$(node -p "require('./package.json').version")"
DRY=0; ARCHS="--x64"
for a in "$@"; do case "$a" in --dry) DRY=1;; --arm64) ARCHS="--x64 --arm64";; esac; done

[ -d node_modules/electron-builder ] || npm ci --no-audit --no-fund
echo "  Building Myra $V…"
rm -rf build/release
npx electron-builder --linux AppImage $ARCHS --publish never
ls -1 build/release/*.AppImage | sed 's/^/  ✓ /'
[ "$DRY" = 1 ] && exit 0

# release notes: the newest section of WHATSNEW.md
NOTES="$(awk '/^## /{n++} n==1 && /^- /' WHATSNEW.md)"
gh release create "v$V" build/release/*.AppImage --title "Myra $V" --notes "$NOTES

**Download:** the AppImage below (x86_64 for most computers). Make it runnable (\`chmod +x Myra-x86_64.AppImage\`, or Properties → Allow executing) and open it. Arch/CachyOS need \`fuse2\` for AppImages: \`sudo pacman -S fuse2\`.
Prefer installing from the code? \`git clone https://github.com/chiangs/myra && cd myra && ./install.sh\`"
echo "  ✓ Published v$V"
