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

# 清残留卷（含 create-dmg 自己产生的 dmg.* 临时卷）
for m in /Volumes/MarkdownForge* /Volumes/dmg.*; do
  [ -d "$m" ] && hdiutil detach "$m" -force >/dev/null 2>&1 || true
done
# 清老 rw.*.dmg 中间产物
find "$OUT_DIR" -name "rw.*.dmg" -delete 2>/dev/null || true

# 准备临时暂存目录（含 .app + 使用说明.pdf）
STAGE=$(mktemp -d)
trap "rm -rf $STAGE" EXIT
cp -R "$APP" "$STAGE/"
cp "$MANUAL" "$STAGE/使用说明.pdf"

echo "→ 打包 DMG: $OUT_DMG"
echo "  app: $(du -sh "$APP" | awk '{print $1}')  manual: $(du -sh "$MANUAL" | awk '{print $1}')"

# create-dmg 参数：
#   1000x600 视图 / 拖入 Applications / 说明书居下 / 中式背景
# NOTE: create-dmg 收尾时偶尔卡 "hdiutil detach 资源忙"（Spotlight/Finder 索引占用）
# 关掉 set -e 单独跑，允许 exit 16 后走兜底
set +e
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
CDR=$?
set -e

# create-dmg 收尾兜底：若正常产物没生成但 rw 中间产物存在，强制卸挂 + 手动 convert
if [ ! -f "$OUT_DMG" ]; then
  RW=$(ls "$OUT_DIR"/rw.*.dmg 2>/dev/null | head -1 || true)
  if [ -n "$RW" ] && [ -f "$RW" ]; then
    echo "⚠️ create-dmg 收尾卡住 (exit=$CDR)，走兜底: hdiutil convert"
    # 强制卸挂所有残留卷
    for m in /Volumes/MarkdownForge* /Volumes/dmg.*; do
      [ -d "$m" ] && hdiutil detach "$m" -force >/dev/null 2>&1 || true
    done
    sleep 1
    hdiutil convert "$RW" -format UDZO -imagekey zlib-level=9 -o "$OUT_DMG"
    rm -f "$RW"
    echo "✓ 兜底成功"
  else
    echo "✗ create-dmg 失败且无 rw.dmg 兜底路径 (exit=$CDR)"
    exit "$CDR"
  fi
fi

echo ""
echo "✓ 完成"
ls -lh "$OUT_DMG"
