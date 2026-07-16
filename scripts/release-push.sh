#!/bin/bash
# 推双端 Release · 用户显式触发（跟 build-release.sh 解耦）
#
# 前置: bash scripts/build-release.sh 已跑完，本地有 tag vX.Y.Z 和 dist-release/*.dmg
# 用法: bash scripts/release-push.sh v1.0.4 [release-notes.md]
# 可选: export GITEE_TOKEN=xxx 才会同步 Gitee Release（无 token 就跳过，走网页兜底）

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJ="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJ"

TAG="${1:?用法: release-push.sh vX.Y.Z [notes.md]}"
NOTES="${2:-}"
VERSION="${TAG#v}"
DMG="dist-release/MarkdownForge-${VERSION}-macOS-AppleSilicon.dmg"

# ─── 前置检查 ───
echo "══════════════════════════════════════════"
echo "  推双端 Release: $TAG"
echo "══════════════════════════════════════════"
echo ""

if ! git tag -l | grep -qx "$TAG"; then
  echo "✗ 本地无此 tag: $TAG"
  echo "  先跑: bash scripts/build-release.sh 建 tag"
  exit 1
fi

if [ ! -f "$DMG" ]; then
  echo "✗ 找不到 DMG: $DMG"
  echo "  先跑: bash scripts/build-release.sh 出片"
  exit 1
fi

REPO_GITEE=$(git remote get-url gitee 2>/dev/null | sed 's|.*:\(.*\)\.git|\1|' || echo "")
REPO_GITHUB=$(git remote get-url github 2>/dev/null | sed 's|.*:\(.*\)\.git|\1|' || echo "")

if [ -z "$REPO_GITEE" ] && [ -z "$REPO_GITHUB" ]; then
  echo "✗ 未配置 gitee/github remote"
  echo "  git remote add github git@github.com:USER/REPO.git"
  echo "  git remote add gitee  git@gitee.com:USER/REPO.git"
  exit 1
fi

# release notes
if [ -z "$NOTES" ] || [ ! -f "$NOTES" ]; then
  NOTES=$(mktemp)
  cat > "$NOTES" <<EOF
MarkdownForge $TAG

## 变更
$(git log --pretty=format:'- %s' $(git tag -l | grep -v "^$TAG$" | tail -1)..$TAG 2>/dev/null | head -30 || echo "- 本次发布")

## 安装
1. 下载 DMG，双击挂载
2. 拖 MarkdownForge.app 到 Applications
3. 首次打开若提示"无法验证开发者"：
   \`\`\`
   xattr -dr com.apple.quarantine /Applications/MarkdownForge.app
   \`\`\`

## 系统要求
- macOS 11+ · Apple Silicon
EOF
  echo "→ 自动生成 release notes（临时文件 $NOTES）"
fi

echo "→ 推 tag 到双端..."
if [ -n "$REPO_GITHUB" ]; then
  git push github "$TAG" 2>&1 | tail -3
fi
if [ -n "$REPO_GITEE" ]; then
  git push gitee "$TAG" 2>&1 | tail -3
fi
# main 分支也推一下（tag 目标 commit 需要能被 remote 看到）
if [ -n "$REPO_GITHUB" ]; then git push github main 2>&1 | tail -2 || true; fi
if [ -n "$REPO_GITEE" ]; then git push gitee main 2>&1 | tail -2 || true; fi

# ─── GitHub Release ───
if [ -n "$REPO_GITHUB" ] && command -v gh >/dev/null; then
  echo ""
  echo "→ GitHub Release + DMG..."
  if gh release view "$TAG" --repo "$REPO_GITHUB" >/dev/null 2>&1; then
    gh release upload "$TAG" --repo "$REPO_GITHUB" --clobber "$DMG"
    echo "  ✓ 已更新 DMG"
  else
    gh release create "$TAG" --repo "$REPO_GITHUB" \
      --title "$TAG" --notes-file "$NOTES" "$DMG"
  fi
  echo "  ✓ https://github.com/$REPO_GITHUB/releases/tag/$TAG"
fi

# ─── Gitee Release ───
if [ -n "$REPO_GITEE" ]; then
  echo ""
  if [ -n "$GITEE_TOKEN" ]; then
    echo "→ Gitee Release + DMG（REST API）..."
    DMG_NAME=$(basename "$DMG")

    # 先看这个 tag 有没有已存在的 release（幂等：重跑同一个 tag 不报错）
    EXISTING=$(curl -s "https://gitee.com/api/v5/repos/$REPO_GITEE/releases/tags/$TAG?access_token=$GITEE_TOKEN")
    REL_ID=$(echo "$EXISTING" | python3 -c "import json,sys
try:
  d = json.load(sys.stdin)
  print(d.get('id','null') if isinstance(d, dict) and 'id' in d else 'null')
except: print('null')" 2>/dev/null || echo "null")

    if [ "$REL_ID" != "null" ] && [ -n "$REL_ID" ]; then
      echo "  · Release 已存在 (id=$REL_ID)，检查附件..."
      HAS_DMG=$(echo "$EXISTING" | python3 -c "import json,sys
try:
  d = json.load(sys.stdin)
  names = [a.get('name','') for a in d.get('assets', [])]
  print('yes' if '$DMG_NAME' in names else 'no')
except: print('no')")
      if [ "$HAS_DMG" = "yes" ]; then
        echo "  ✓ DMG 已挂在 Release 上，跳过上传"
      else
        echo "  · 上传 DMG..."
        curl -s -X POST "https://gitee.com/api/v5/repos/$REPO_GITEE/releases/$REL_ID/attach_files" \
          -F "access_token=$GITEE_TOKEN" -F "file=@$DMG" > /dev/null
        echo "  ✓ DMG 已追加"
      fi
      echo "  ✓ https://gitee.com/$REPO_GITEE/releases/tag/$TAG"
    else
      # 没有则新建
      BODY=$(python3 -c "import json,sys; print(json.dumps(open('$NOTES').read()))")
      RESP=$(curl -s -X POST "https://gitee.com/api/v5/repos/$REPO_GITEE/releases" \
        -H "Content-Type: application/json" \
        -d "{\"access_token\":\"$GITEE_TOKEN\",\"tag_name\":\"$TAG\",\"name\":\"$TAG\",\"body\":$BODY,\"target_commitish\":\"main\"}")
      REL_ID=$(echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id','null'))" 2>/dev/null || echo "null")
      if [ "$REL_ID" != "null" ] && [ -n "$REL_ID" ]; then
        curl -s -X POST "https://gitee.com/api/v5/repos/$REPO_GITEE/releases/$REL_ID/attach_files" \
          -F "access_token=$GITEE_TOKEN" -F "file=@$DMG" > /dev/null
        echo "  ✓ https://gitee.com/$REPO_GITEE/releases/tag/$TAG"
      else
        echo "  ✗ Gitee Release 建失败，Response: $RESP"
        echo "  兜底: https://gitee.com/$REPO_GITEE/releases/new?tag=$TAG"
      fi
    fi
  else
    echo "→ Gitee: 未设 GITEE_TOKEN，走网页兜底"
    echo "  https://gitee.com/$REPO_GITEE/releases/new?tag=$TAG"
    echo "  网页上传 $DMG"
  fi
fi

echo ""
echo "══════════════════════════════════════════"
echo "  ✓ 发布完成"
echo "══════════════════════════════════════════"
