#!/bin/bash
# 把 dmg-assets/使用说明.md 渲染成 PDF（用 markdownforge 主题 + Chrome headless）
# 输出: dmg-assets/使用说明.pdf

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJ="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC="$PROJ/dmg-assets/使用说明.md"
OUT="$PROJ/dmg-assets/使用说明.pdf"
SHARED="$PROJ/src-frontend"

if [ ! -f "$SRC" ]; then echo "缺 $SRC"; exit 1; fi

TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

# 1) 复制 markdownforge 前端资源
cp "$SHARED/main.css" "$TMPDIR/"
cp -r "$SHARED/libs" "$TMPDIR/"

# 2) 用一段 inline 脚本渲染 md → html（走 marked）
MD_CONTENT=$(cat "$SRC")

cat > "$TMPDIR/render.html" <<'HTML_HEAD'
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>MarkdownForge 使用说明</title>
<link rel="stylesheet" href="main.css">
<style>
  body { margin: 0; padding: 0; background: #f7f0e0; }
  .page { max-width: 820px; margin: 0 auto; padding: 60px 70px; }
  #preview { min-height: auto; box-shadow: none; }
</style>
</head>
<body>
<div class="page"><div id="preview" class="warm"></div></div>
<script src="libs/marked.min.js"></script>
<script src="libs/highlight.min.js"></script>
<script id="src" type="text/markdown">
HTML_HEAD

# 转义并写入 markdown 内容
printf '%s' "$MD_CONTENT" >> "$TMPDIR/render.html"

cat >> "$TMPDIR/render.html" <<'HTML_TAIL'
</script>
<script>
  marked.setOptions({ gfm: true, breaks: true });
  if (typeof hljs !== 'undefined') {
    const r = new marked.Renderer();
    r.code = function(token) {
      const code = (typeof token === 'string') ? token : (token.text || '');
      const lang = (typeof token === 'string') ? arguments[1] : (token.lang || '');
      const language = lang && hljs.getLanguage(lang) ? lang : '';
      let out;
      try {
        out = language
          ? hljs.highlight(code, { language, ignoreIllegals: true }).value
          : hljs.highlightAuto(code).value;
      } catch(e) { out = code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
      return '<pre><code class="hljs ' + (language ? 'language-'+language : '') + '">' + out + '</code></pre>';
    };
    marked.setOptions({ renderer: r });
  }
  const md = document.getElementById('src').textContent;
  document.getElementById('preview').innerHTML = marked.parse(md);
  // 探测高度，写到 body data 属性给 Chrome headless 抓
  requestAnimationFrame(() => {
    setTimeout(() => {
      const h = document.body.scrollHeight;
      document.body.setAttribute('data-page-height', String(h));
      document.title = 'MarkdownForge 使用说明 · H=' + h;
    }, 300);
  });
</script>
</body>
</html>
HTML_TAIL

# 3) 找 Chrome
CHROME=""
for p in \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary" \
  "/Applications/Chromium.app/Contents/MacOS/Chromium" \
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
; do
  [ -x "$p" ] && CHROME="$p" && break
done

if [ -z "$CHROME" ]; then
  echo "找不到 Chrome/Edge/Brave，无法生成 PDF"
  exit 1
fi

# 4) 探测高度
DUMP=$("$CHROME" --headless --disable-gpu --no-sandbox --virtual-time-budget=3000 \
       --dump-dom "file://$TMPDIR/render.html" 2>/dev/null | tr -d '\n')
H=$(echo "$DUMP" | grep -oE 'data-page-height="[0-9]+"' | head -1 | grep -oE '[0-9]+')
[ -z "$H" ] && H=2000
WPT=$(awk "BEGIN{print 820*72/96}")
HPT=$(awk "BEGIN{print $H*72/96}")

echo "content H=${H}px  → PDF ${WPT}x${HPT}pt"

# 5) 注入 @page 尺寸
sed -i.bak "s|</style>|@page { size: ${WPT}pt ${HPT}pt; margin: 0; }\\n</style>|" "$TMPDIR/render.html"

# 6) 生成 PDF
"$CHROME" --headless --disable-gpu --no-sandbox --no-pdf-header-footer \
  --virtual-time-budget=3000 \
  --print-to-pdf="$OUT" \
  --print-to-pdf-no-header \
  "file://$TMPDIR/render.html" 2>/dev/null

if [ -f "$OUT" ]; then
  echo "✓ $OUT  ($(du -h "$OUT" | awk '{print $1}'))"
else
  echo "✗ 生成失败"
  exit 1
fi
