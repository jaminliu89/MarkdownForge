#!/bin/bash
# 商业级 DMG 打包 —— MarkdownForge.app + 使用说明.pdf + Applications 快捷方式 + 中式背景
#
# 前置：
#   cargo tauri build --bundles app  已产出 .app
#   dmg-assets/ 已含 dmg-bg.png + 使用说明.pdf
#
# 输出：
#   dist-release/MarkdownForge-1.0.0-macOS-AppleSilicon.dmg

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

# 前置检查
for f in "$APP" "$BG" "$MANUAL"; do
  if [ ! -e "$f" ]; then echo "缺文件: $f"; exit 1; fi
done

mkdir -p "$OUT_DIR"
rm -f "$OUT_DMG"

# 清残留卷
for m in "/Volumes/MarkdownForge"*; do
  [ -d "$m" ] && hdiutil detach "$m" -force >/dev/null 2>&1 || true
done

# 准备临时暂存目录（含 .app + 使用说明.pdf）
STAGE=$(mktemp -d)
trap "rm -rf $STAGE" EXIT
cp -R "$APP" "$STAGE/"
cp "$MANUAL" "$STAGE/使用说明.pdf"

echo "→ 打包 DMG: $OUT_DMG"
echo "  app: $(du -sh "$APP" | awk '{print $1}')  manual: $(du -sh "$MANUAL" | awk '{print $1}')"

# create-dmg 参数：
#   1000x600 视图 / 拖入 Applications / 说明书居下 / 中式背景
create-dmg \
  --volname "MarkdownForge ${VERSION}" \
  --volicon "$ICON" \
  --background "$BG" \
  --window-pos 200 120 \
  --window-size 1000 600 \
  --icon-size 128 \
  --text-size 14 \
  --icon "MarkdownForge.app" 200 230 \
  --app-drop-link            700 230 \
  --icon "使用说明.pdf"      450 460 \
  --hide-extension "MarkdownForge.app" \
  --no-internet-enable \
  "$OUT_DMG" \
  "$STAGE"

echo ""
echo "✓ 完成"
ls -lh "$OUT_DMG"
