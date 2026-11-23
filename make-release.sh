#!/bin/bash
# Builds the Fenmyr AppImage and publishes it as a GitHub Release.
#   ./make-release.sh          build + publish the version in package.json
#   ./make-release.sh --dry    build the AppImage, then print the release command instead of running it
#   ./make-release.sh --arm64  also build for 64-bit ARM
# People download it from https://github.com/chiangs/fenmyr/releases/latest
# The AppImage updates itself from those releases (src/host/update.ts looks for Fenmyr-<arch>.AppImage).
#
# A version with a prerelease part (1.1.0-beta.2) is published as a GitHub prerelease, so /releases/latest, and every
# AppImage on its default path, stays on the last stable release. Clones on Beta find it by its tag. The tag marks the
# commit that was built, so HEAD has to be on GitHub first.
#
# To cut a beta:
#   1. Set "version" in package.json to 1.1.0-beta.N.
#   2. Add its section to WHATSNEW.md, for example "## December 2026 · 1.1.0-beta.1".
#   3. Merge.
#   4. Run ./make-release.sh from main.
set -e
cd "$(dirname "$0")"
V="$(node -p "require('./package.json').version")"
DRY=0; ARCHS="--x64"
for a in "$@"; do case "$a" in --dry) DRY=1;; --arm64) ARCHS="--x64 --arm64";; esac; done

# the updater only reads tags that look like this, so any other version would be published and never found
[[ "$V" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$ ]] || { echo "  package.json says version \"$V\", which isn't a release name like 1.1.0 or 1.1.0-beta.2."; exit 1; }
PRE=(); case "$V" in *-*) PRE=(--prerelease);; esac
SHA="$(git rev-parse HEAD)"
if [ "$DRY" != 1 ] && [ -z "$(git for-each-ref --count=1 --contains HEAD refs/remotes/origin)" ]; then
  echo "  This commit isn't on GitHub yet. Push it first, so the release tag marks the commit that was built."; exit 1
fi

[ -d node_modules/electron-builder ] || npm ci --no-audit --no-fund
echo "  Building Fenmyr $V…"
rm -rf build/release
npm run build --silent
npx electron-builder --linux AppImage $ARCHS --publish never
ls -1 build/release/*.AppImage | sed 's/^/  ✓ /'
if [ "$DRY" = 1 ]; then
  echo "  Would run: gh release create v$V build/release/*.AppImage --title \"Fenmyr $V\" --target $SHA ${PRE[*]} --notes <the newest WHATSNEW.md section>"
  exit 0
fi

# release notes: the newest section of WHATSNEW.md
NOTES="$(awk '/^## /{n++} n==1 && /^- /' WHATSNEW.md)"
gh release create "v$V" build/release/*.AppImage --title "Fenmyr $V" --target "$SHA" "${PRE[@]}" --notes "$NOTES

**Download:** the AppImage below (x86_64 for most computers). Make it runnable (\`chmod +x Fenmyr-x86_64.AppImage\`, or Properties → Allow executing) and open it. Arch/CachyOS need \`fuse2\` for AppImages: \`sudo pacman -S fuse2\`.
Prefer installing from the code? \`git clone https://github.com/chiangs/fenmyr && cd fenmyr && ./install.sh\`"
echo "  ✓ Published v$V${PRE[*]:+ as a prerelease}"
