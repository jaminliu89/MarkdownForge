#!/bin/bash
# 商业级 DMG 打包（dmgbuild 版）
#
# 换掉 create-dmg（macOS 26 Finder 拒绝 set background picture 的老 bug）。
# dmgbuild 直接写 .DS_Store 二进制，绕开 AppleScript。

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJ="$(cd "$SCRIPT_DIR/.." && pwd)"
VERSION=$(grep -m1 '"version"' "$PROJ/tauri.conf.json" | sed 's/.*"version": *"\([^"]*\)".*/\1/')
APP="$PROJ/target/release/bundle/macos/MarkdownForge.app"
OUT_DIR="$PROJ/dist-release"
OUT_DMG="$OUT_DIR/MarkdownForge-${VERSION}-macOS-AppleSilicon.dmg"
BG="$PROJ/dmg-assets/dmg-bg.png"
MANUAL="$PROJ/dmg-assets/使用说明.pdf"
ICON="$PROJ/icons/icon.icns"
SETTINGS="$SCRIPT_DIR/dmgbuild-settings.py"

# 前置检查
for f in "$APP" "$BG" "$MANUAL" "$ICON" "$SETTINGS"; do
  if [ ! -e "$f" ]; then echo "缺文件: $f"; exit 1; fi
done

# 找 dmgbuild
DMGBUILD="$(command -v dmgbuild || echo ~/Library/Python/3.12/bin/dmgbuild)"
if [ ! -x "$DMGBUILD" ]; then
  # fallback: 用 python3 -m
  DMGBUILD_CMD="python3 -m dmgbuild"
else
  DMGBUILD_CMD="$DMGBUILD"
fi
echo "dmgbuild: $DMGBUILD_CMD"

mkdir -p "$OUT_DIR"
rm -f "$OUT_DMG"

# 清残留卷 + 中间产物
for m in /Volumes/MarkdownForge* /Volumes/dmg.*; do
  [ -d "$m" ] && hdiutil detach "$m" -force >/dev/null 2>&1 || true
done
find "$OUT_DIR" -name "rw.*.dmg" -delete 2>/dev/null || true

echo "→ 打包 DMG: $OUT_DMG"
echo "  app: $(du -sh "$APP" | awk '{print $1}')  manual: $(du -sh "$MANUAL" | awk '{print $1}')"

$DMGBUILD_CMD \
  -s "$SETTINGS" \
  -D app="$APP" \
  -D bg="$BG" \
  -D pdf="$MANUAL" \
  -D icon="$ICON" \
  --detach-retries 10 \
  "MarkdownForge ${VERSION}" \
  "$OUT_DMG"

if [ ! -f "$OUT_DMG" ]; then
  echo "✗ dmgbuild 未产出 DMG"
  exit 1
fi

echo ""
echo "✓ 完成"
ls -lh "$OUT_DMG"
