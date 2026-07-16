#!/bin/bash
# 回滚到某个 tag 版本 + 重新出 DMG
# 用法: bash scripts/rollback.sh v1.0.2

set -e
TAG="${1:?用法: rollback.sh vX.Y.Z}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJ="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJ"

if ! git tag -l | grep -qx "$TAG"; then
  echo "✗ 无此 tag: $TAG"
  echo "  可用 tag:"
  git tag -l 'v*' | sed 's/^/    /'
  exit 1
fi

# 保护：有未提交改动就拦住，避免丢失
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "✗ 有未提交改动，先 stash 或 commit"
  git status --short
  exit 1
fi

echo "→ checkout $TAG"
git checkout "$TAG"
echo ""
echo "→ 重跑 build-release.sh"
bash scripts/build-release.sh

echo ""
echo "══════════════════════════════════════════"
echo "  已回滚到 $TAG"
echo "  返回主线: git checkout main"
echo "══════════════════════════════════════════"
