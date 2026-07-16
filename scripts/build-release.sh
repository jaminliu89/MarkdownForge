#!/bin/bash
# 一键商业级发布 —— 从 cargo tauri build 到 DMG
#
# 步骤:
#   1. cargo tauri build --bundles app (只出 .app, 不用 Tauri 自带 DMG)
#   2. 生成 dmg-bg.png (Python + PIL)
#   3. 生成 使用说明.pdf (Chrome headless 渲染 markdown)
#   4. create-dmg 打包 (自定义背景 + 使用说明 + Applications 快捷方式)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJ="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJ"

echo "══════════════════════════════════════════"
echo "  MarkdownForge · 商业级发布流水线"
echo "══════════════════════════════════════════"
echo ""

# 1. 编译 + 打包 .app
echo "[1/4] cargo tauri build (仅 .app)..."
cargo tauri build --bundles app 2>&1 | tail -5

APP="$PROJ/target/release/bundle/macos/MarkdownForge.app"
if [ ! -d "$APP" ]; then
  echo "✗ .app 未生成"; exit 1
fi
echo "  ✓ $APP  ($(du -sh "$APP" | awk '{print $1}'))"
echo ""

# 2. 背景图
echo "[2/4] 生成 DMG 背景图..."
python3 scripts/gen-dmg-bg.py dmg-assets/dmg-bg.png
echo ""

# 3. 使用说明 PDF
echo "[3/4] 渲染使用说明 PDF..."
bash scripts/build-manual-pdf.sh
echo ""

# 4. 打包 DMG
echo "[4/4] create-dmg 打包..."
bash scripts/make-dmg.sh

echo ""
echo "══════════════════════════════════════════"
echo "  ✓ 发布完成"
echo "══════════════════════════════════════════"
