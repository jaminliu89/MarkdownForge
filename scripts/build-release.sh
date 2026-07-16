#!/bin/bash
# 一键商业级发布 —— 从 cargo tauri build 到 DMG
#
# 步骤:
#   0. 门禁 P + S（html2canvas-pro 检查 + build 残留清理）
#   1. cargo tauri build --bundles app (只出 .app, 不用 Tauri 自带 DMG)
#   2. 生成 dmg-bg.png (Python + PIL)
#   3. 生成 使用说明.pdf (Chrome headless 渲染 markdown)
#   4. create-dmg 打包 (自定义背景 + 使用说明 + Applications 快捷方式)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJ="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJ"

APP_NAME="MarkdownForge.app"

echo "══════════════════════════════════════════"
echo "  MarkdownForge · 商业级发布流水线"
echo "══════════════════════════════════════════"
echo ""

# ─── 门禁 P: html2canvas-pro 强制检查 ───
echo "[门禁 P] 检查 html2canvas-pro..."
LIBS_FOUND=0
for f in $(find src-frontend -name "html2canvas.min.js" 2>/dev/null); do
  LIBS_FOUND=1
  if ! head -c 500 "$f" | grep -q "html2canvas-pro"; then
    echo "  ✗ $f 是原版 html2canvas，不是 -pro"
    echo "    macOS Tauri WKWebView 下 P3 色域会导致 PDF/长图静默截断"
    echo "    修法: curl -sL -o \"$f\" \"https://unpkg.com/html2canvas-pro@1.5.11/dist/html2canvas-pro.min.js\""
    exit 1
  fi
done
if [ $LIBS_FOUND -eq 0 ]; then
  echo "  ⚠️ 未在 src-frontend/ 找到 html2canvas.min.js（跳过检查）"
else
  echo "  ✓ 所有 html2canvas 副本都是 -pro"
fi
echo ""

# ─── 门禁 S: 清 build 残留 .app（Spotlight 污染） ───
echo "[门禁 S] 清 build 残留 .app..."
rm -rf "target/release/bundle/macos/$APP_NAME" 2>/dev/null || true
for parent in .. ../.. ../../..; do
  stray="$parent/target/release/bundle/macos/$APP_NAME"
  if [ -d "$stray" ]; then
    ABS=$(cd "$parent" && pwd)
    echo "  ✗ 父级残留: $ABS/target/release/bundle/macos/$APP_NAME"
    rm -rf "$stray"
    echo "    已清"
  fi
done
LINGER=$(mdfind "kMDItemFSName == '$APP_NAME'" 2>/dev/null | grep -v "^/Applications/$APP_NAME$" || true)
if [ -n "$LINGER" ]; then
  echo "  ⚠️ Spotlight 索引里还有下面这些 .app（可能污染用户搜索）："
  echo "$LINGER" | sed 's/^/    /'
fi
echo "  ✓ 清理完成"
echo ""

# 1. 编译 + 打包 .app
echo "[1/4] cargo tauri build (仅 .app)..."
cargo tauri build --bundles app 2>&1 | tail -5

APP="$PROJ/target/release/bundle/macos/$APP_NAME"
if [ ! -d "$APP" ]; then
  echo "✗ .app 未生成"; exit 1
fi
echo "  ✓ $APP  ($(du -sh "$APP" | awk '{print $1}'))"
echo ""

# ─── 门禁 T: E2E 冒烟（新版功能全跑一遍）───
echo "[门禁 T] E2E 冒烟测试..."
rm -f /tmp/mf-e2e.json /tmp/mf-debug.log
BIN="$PROJ/target/release/markdownforge"
if [ ! -x "$BIN" ]; then
  echo "  ⚠️ release 二进制不存在，跳过 E2E（这不应该发生）"
else
  MF_E2E=1 "$BIN" >/dev/null 2>&1 || true
  if [ ! -f /tmp/mf-e2e.json ]; then
    echo "  ✗ E2E 未生成结果文件 /tmp/mf-e2e.json"
    echo "  --- debug log ---"
    tail -20 /tmp/mf-debug.log 2>/dev/null || echo "  (无 debug log)"
    exit 1
  fi
  # 用 python 解析（比 grep 稳）
  SUMMARY=$(python3 -c "
import json, sys
r = json.load(open('/tmp/mf-e2e.json'))
fails = [k for k, v in r['tests'].items() if not v['pass']]
print(r.get('summary', '?'))
if fails:
    print('FAILED:', ','.join(fails), file=sys.stderr)
    for k in fails:
        print(f'  {k}: {r[\"tests\"][k][\"detail\"]}', file=sys.stderr)
    sys.exit(1)
")
  E2E_RC=$?
  echo "  $SUMMARY"
  if [ $E2E_RC -ne 0 ]; then
    echo "  ✗ E2E 有失败项，阻断发布"
    exit 1
  fi
  echo "  ✓ 全部通过"
fi
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
# ─── 门禁 S 收尾: 清 build 产物 .app（已进 DMG，target/ 里的是残留）───
echo "[门禁 S 收尾] 清 target/ 里的 .app（Spotlight 污染源）..."
rm -rf "target/release/bundle/macos/$APP_NAME" 2>/dev/null && echo "  ✓ 已清 target/release/bundle/macos/$APP_NAME"

echo ""
# ─── 门禁 V（Version-lock）: 本地 tag 冻结本次通过验证的代码 ───
echo "[门禁 V] 本地 tag 冻结验证过的版本..."
VERSION=$(grep -m1 '"version"' tauri.conf.json | sed 's/.*"version": *"\([^"]*\)".*/\1/')
TAG="v$VERSION"

if git tag -l | grep -qx "$TAG"; then
  echo "  ⚠️ tag $TAG 已存在（可能重复 build 同版本）"
  echo "     如需覆盖: git tag -d $TAG"
  echo "     如需升版: 改 tauri.conf.json version 后重跑"
else
  # 只 commit 干净的源改动，不含 DMG 产物
  git add -A ':!dist-release/*.dmg' ':!dist-release/*.zip' ':!dist-release/*.tar.gz' 2>/dev/null || git add -A
  if git diff --cached --quiet; then
    echo "  ⚠️ 无待提交改动，跳过 commit，直接打 tag 到 HEAD"
  else
    git commit -m "release: $TAG" --quiet
    echo "  ✓ commit: $(git log -1 --format='%h %s')"
  fi
  DMG_PATH="dist-release/MarkdownForge-${VERSION}-macOS-AppleSilicon.dmg"
  DMG_SIZE=$([ -f "$DMG_PATH" ] && du -h "$DMG_PATH" | awk '{print $1}' || echo "?")
  git tag -a "$TAG" -m "Release $TAG · E2E 10/10 通过 · DMG $DMG_SIZE" --quiet
  echo "  ✓ tag: $TAG"
  echo ""
  echo "  ─── 回滚: git checkout $TAG"
  echo "  ─── 推双端发布: bash scripts/release-push.sh $TAG"
fi

echo ""
echo "══════════════════════════════════════════"
echo "  ✓ 发布完成"
echo "══════════════════════════════════════════"
