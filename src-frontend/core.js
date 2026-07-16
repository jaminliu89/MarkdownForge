// ============ Tauri 环境适配 ============
// Tauri 2 的 WKWebView 拦截 <a download>，走 Rust 命令保存
// 注意：Tauri 2 已经把 window.isTauri 注册为不可覆盖的只读 boolean，
// 我们不能定义同名函数，用 inTauri 代替
function inTauri() {
  return typeof window !== 'undefined' && !!(window.__TAURI_INTERNALS__ || window.__TAURI__);
}

function _tauriInvoke() {
  return (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke)
    || (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke)
    || null;
}

// 前端 debug_log 包装 —— 调 Rust 后端的 debug_log 命令写到 /tmp/mf-debug.log
function debugLog(msg) {
  if (inTauri()) {
    const invoke = _tauriInvoke();
    if (invoke) {
      invoke('debug_log', { msg: String(msg).substring(0, 2000) }).catch(() => {});
    }
  }
  console.log('[DEBUG]', msg);
}

// Blob → base64
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const s = reader.result;
      const idx = s.indexOf(',');
      resolve(idx >= 0 ? s.slice(idx + 1) : s);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// 用 Rust 后端保存 Blob 到用户选定路径
async function saveViaTauri(blob, defaultName, filters) {
  try {
    const invoke = _tauriInvoke();
    if (!invoke) throw new Error('Tauri invoke API 不可用');
    const b64 = await blobToBase64(blob);
    const rustFilters = (filters || []).map(f => [f.name, f.extensions]);
    return await invoke('save_blob_base64', {
      defaultName,
      filters: rustFilters,
      b64Data: b64,
    });
  } catch(e) {
    console.error('[saveViaTauri] failed:', e && (e.stack || e.message || e));
    throw e;
  }
}

marked.setOptions({
  gfm: true,
  breaks: true,
  smartLists: true,
});

// 让 marked 用 highlight.js 处理代码块（如果 hljs 已加载）
if (typeof hljs !== 'undefined') {
  const renderer = new marked.Renderer();
  renderer.code = function(token) {
    // marked v15+: 传入 token 对象 {text, lang, escaped, type}
    // marked v4-14: 传入 (code, lang, escaped) 三个参数
    const code = (typeof token === 'string') ? token : (token.text || '');
    const lang = (typeof token === 'string') ? arguments[1] : (token.lang || '');
    const language = lang && hljs.getLanguage(lang) ? lang : '';
    let highlighted;
    try {
      highlighted = language
        ? hljs.highlight(code, { language, ignoreIllegals: true }).value
        : hljs.highlightAuto(code).value;
    } catch(e) {
      // 转义原始代码作 fallback
      highlighted = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    const cls = language ? 'hljs language-' + language : 'hljs';
    return '<pre><code class="' + cls + '">' + highlighted + '</code></pre>';
  };
  marked.setOptions({ renderer });
}

const input = document.getElementById('input');
const preview = document.getElementById('preview');
const inCount = document.getElementById('in-count');
const outCount = document.getElementById('out-count');

// ============ 双向同步：预览区可编辑 → 反写 markdown ============
let syncingFromPreview = false;
let syncingFromInput = false;

// 初始化 turndown（HTML → Markdown）
const turndown = new TurndownService({
  headingStyle: 'atx',           // 用 # 而不是 =====
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',      // 用 ``` 而不是缩进
  emDelimiter: '*',
  strongDelimiter: '**',
  linkStyle: 'inlined',
});
// 装 GFM 插件（表格、任务列表、删除线）
if (typeof turndownPluginGfm !== 'undefined') {
  turndown.use(turndownPluginGfm.gfm);
}
// 自定义规则：让复选框正确输出 - [ ] / - [x]
turndown.addRule('taskListItems', {
  filter: (node) => node.nodeName === 'LI' && node.querySelector('input[type="checkbox"]'),
  replacement: (content, node) => {
    const cb = node.querySelector('input[type="checkbox"]');
    const checked = cb.checked || cb.hasAttribute('checked');
    // 去掉 checkbox 元素本身产生的空白
    const text = content.replace(/^\s+/, '').trim();
    return '- [' + (checked ? 'x' : ' ') + '] ' + text + '\n';
  }
});

// input 输入 → 渲染 preview
function render() {
  if (syncingFromPreview) return;   // 别再回写触发死循环
  syncingFromInput = true;
  const md = input.value;
  preview.innerHTML = marked.parse(md);
  inCount.textContent = md.length + ' 字';
  outCount.textContent = preview.innerText.length + ' 字';
  requestAnimationFrame(() => { syncingFromInput = false; });
}

// preview 编辑 → 反写 markdown
let previewDebounce;
function syncFromPreview() {
  if (syncingFromInput) return;
  clearTimeout(previewDebounce);
  previewDebounce = setTimeout(() => {
    syncingFromPreview = true;
    try {
      // 深克隆 preview 内容，从副本转 markdown（原 preview 保持渲染状态）
      const clone = preview.cloneNode(true);
      // 去掉所有 contenteditable 属性
      clone.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
      const md = turndown.turndown(clone.innerHTML);
      input.value = md;
      inCount.textContent = md.length + ' 字';
      outCount.textContent = preview.innerText.length + ' 字';
    } catch(e) {
      console.error('反向同步失败', e);
    }
    setTimeout(() => { syncingFromPreview = false; }, 50);
  }, 300);
}

// 切换预览区编辑模式
function toggleEdit() {
  const btn = document.getElementById('edit-toggle');
  const on = preview.contentEditable !== 'true';
  preview.contentEditable = on ? 'true' : 'false';
  preview.style.outline = on ? '1px dashed rgba(0,0,0,0.15)' : 'none';
  btn.textContent = on ? '✎ 编辑中' : '✎ 可编辑';
  btn.classList.toggle('primary', on);
  toast(on ? '预览区可直接编辑，改动实时同步到左边 Markdown' : '预览区已锁定为只读');
}

input.addEventListener('input', render);
preview.addEventListener('input', syncFromPreview);

// 默认可编辑，加个虚线框提示
window.addEventListener('DOMContentLoaded', () => {
  preview.style.outline = '1px dashed rgba(0,0,0,0.08)';
  document.getElementById('edit-toggle').classList.add('primary');
  document.getElementById('edit-toggle').textContent = '✎ 编辑中';
});


// ============ 主题切换 ============
function applyTheme() {
  const sel = document.getElementById('theme');
  if (!sel) return;
  preview.className = sel.value;   // 空字符串 = 默认，其他 = 主题类名
}

// ============ 全屏切换 ============
function togglePane(which) {
  const main = document.querySelector('main');
  const targetClass = 'focus-' + which;
  const isActive = main.classList.contains(targetClass);

  // 先清掉所有 focus 类
  main.classList.remove('focus-input', 'focus-preview');
  document.querySelectorAll('.icon-btn').forEach(b => b.classList.remove('active'));

  if (!isActive) {
    main.classList.add(targetClass);
    // 高亮对应按钮
    const btn = document.querySelector('[data-pane="' + which + '"] .icon-btn');
    if (btn) btn.classList.add('active');
    toast(which === 'input' ? '专注 Markdown 编辑（按 ESC 退出）' : '专注预览（按 ESC 退出）');
  } else {
    toast('恢复双栏');
  }
}

// ESC 退出全屏
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const main = document.querySelector('main');
    if (main.classList.contains('focus-input') || main.classList.contains('focus-preview')) {
      main.classList.remove('focus-input', 'focus-preview');
      document.querySelectorAll('.icon-btn').forEach(b => b.classList.remove('active'));
      toast('恢复双栏');
    }
  }
});

function loadDemo() {
  input.value = `# 欢迎使用 Markdown 抛光机

把普通的 **Markdown 文本**转换成排版精美的 HTML，支持中文优化。

## 主要特性

- **实时预览**：改动立即可见
- **中文排版**：字间距、行高、标点全部优化
- **GFM 语法**：表格、任务列表、删除线全支持
- **一键下载**：导出可直接分享的 HTML

## 一段中文段落示范

> 一个人在房间里贴了一面白板墙，上面画满了计划：要做 vlog、要做拍摄、要怎么挣钱。规划了好几年，但**仅仅停留在白板上**。

这就是很多人的写照——**永远在准备，永远不开始**。

*注：此段引用来自真实素材，仅作示范用。*

## 代码示例

\`\`\`javascript
function greet(name) {
  return \`你好，\${name}！\`;
}
console.log(greet('世界'));
\`\`\`

## 任务清单

- [x] 写好文案
- [x] 录制视频
- [ ] 剪辑上线
- [ ] 涨到 10 万粉

## 数据对比

| 项目 | 之前 | 现在 |
|------|------|------|
| 粉丝 | 16 万 | 8 万 |
| 更新频率 | 每周 | 停更 |
| 收入 | 稳定 | 靠姐派单 |

---

**提示**：这个工具完全离线，你的内容不会离开你的电脑。`;
  render();
}

function copyHTML() {
  const html = buildStandaloneHTML();
  navigator.clipboard.writeText(html).then(() => toast('独立 HTML 已复制 · 终端可运行 md2pdf 生成矢量 PDF'));
}

function copyRich() {
  // 复制成富文本（可以直接粘到微信公众号、Word、飞书）
  const range = document.createRange();
  range.selectNodeContents(preview);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  try {
    document.execCommand('copy');
    toast('富文本已复制（可粘到微信/Word/飞书）');
  } catch(e) {
    toast('复制失败');
  }
  sel.removeAllRanges();
}

// 抽出只跟 #preview 相关的 CSS 规则（去掉 body/header/main 这些 app 布局样式）
function extractPreviewCSS() {
  const rules = [];
  for (const sheet of document.styleSheets) {
    let sheetRules;
    try { sheetRules = sheet.cssRules; } catch(e) { continue; }
    for (const r of sheetRules) {
      const txt = r.cssText;
      // 只保留跟 #preview 和 marked 相关的规则
      if (/#preview|\.toast/.test(txt) === false) continue;
      rules.push(txt);
    }
  }
  return rules.join('\n');
}

function buildStandaloneHTML() {
  const themeClass = preview.className || '';
  const previewCSS = extractPreviewCSS();
  // 抓第一个 h1 作为标题
  const h1 = preview.querySelector('h1');
  const title = h1 ? h1.textContent.trim() : 'Markdown 导出';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  background: #ececef;
  min-height: 100vh;
  font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif;
}
.page {
  max-width: 820px;
  margin: 40px auto;
  background: #fff;
  box-shadow: 0 4px 32px rgba(0,0,0,0.08);
  border-radius: 10px;
  overflow: hidden;
}
/* 移除掉预览容器的 flex/overflow 约束，让内容自然流布局 */
#preview {
  flex: none !important;
  overflow: visible !important;
  height: auto !important;
  max-height: none !important;
  padding: 56px 64px 72px !important;
}
${previewCSS}
@media (max-width: 640px) {
  .page { margin: 0; border-radius: 0; }
  #preview { padding: 32px 24px 48px !important; }
}
@media print {
  body { background: #fff; }
  .page { box-shadow: none; margin: 0; max-width: none; border-radius: 0; }
  #preview { padding: 20mm !important; }
}
</style>
</head>
<body>
<div class="page">
<div id="preview" class="${themeClass}">${preview.innerHTML}</div>
</div>
</body>
</html>`;
}

async function downloadHTML() {
  const html = buildStandaloneHTML();
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const filename = 'markdown-' + Date.now() + '.html';
  if (inTauri()) {
    await saveViaTauri(blob, filename, [{ name: 'HTML', extensions: ['html'] }]);
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  toast('HTML 已保存 · 可滚动 · 保留样式');
}

// ========== PDF 导出（单页贴合，高倍渲染）==========
async function downloadPDF() {
  if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
    toast('渲染库未就绪');
    return;
  }
  toast('正在渲染 PDF……');

  const header = document.querySelector('header');
  const batchPanel = document.getElementById('batch-panel');
  const wasEditMode = preview.isContentEditable;
  let headerDisp, batchDisp;
  if (header) { headerDisp = header.style.display; header.style.display = 'none'; }
  if (batchPanel) { batchDisp = batchPanel.style.display; batchPanel.style.display = 'none'; }
  if (wasEditMode) preview.contentEditable = 'false';

  const bgColor = window.getComputedStyle(preview).backgroundColor || '#fff';

  try {
    const canvas = await html2canvas(preview, {
      scale: 3,
      backgroundColor: bgColor,
      logging: false,
      windowWidth: preview.scrollWidth || 820,
      scrollY: 0,
      useCORS: false,
    });

    const wPt = canvas.width * 72 / (96 * 3);
    const hPt = canvas.height * 72 / (96 * 3);

    const { jsPDF } = jspdf;
    const pdf = new jsPDF({
      orientation: hPt > wPt ? 'portrait' : 'landscape',
      unit: 'pt',
      format: [wPt, hPt],
      compress: true,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    pdf.addImage(imgData, 'JPEG', 0, 0, wPt, hPt, undefined, 'FAST');

    const filename = 'markdown-' + Date.now() + '.pdf';
    if (inTauri()) {
      const blob = pdf.output('blob');
      await saveViaTauri(blob, filename, [{ name: 'PDF', extensions: ['pdf'] }]);
    } else {
      pdf.save(filename);
    }
    toast('PDF 已保存（单页贴合，3x 高清）');
  } catch(e) {
    const errMsg = (e && (e.stack || e.message || e)) || '未知错误';
    debugLog('PDF export error: ' + (''+errMsg).substring(0, 500));
    toast('PDF 生成失败：' + errMsg);
    console.error('[PDF export error]', e);
  } finally {
    if (header) header.style.display = headerDisp || '';
    if (batchPanel) batchPanel.style.display = batchDisp || '';
    if (wasEditMode) preview.contentEditable = 'true';
  }
}

// ========== 长图 PNG 导出（html2canvas 原位抓取）==========
async function downloadPNG() {
  if (typeof html2canvas === 'undefined') {
    toast('长图渲染库未就绪');
    return;
  }
  toast('正在渲染长图，请稍候……');

  const header = document.querySelector('header');
  const batchPanel = document.getElementById('batch-panel');
  const wasEditMode = preview.isContentEditable;
  let headerDisp, batchDisp;
  if (header) { headerDisp = header.style.display; header.style.display = 'none'; }
  if (batchPanel) { batchDisp = batchPanel.style.display; batchPanel.style.display = 'none'; }
  if (wasEditMode) preview.contentEditable = 'false';

  const bgColor = window.getComputedStyle(preview).backgroundColor || '#fff';

  try {
    const canvas = await html2canvas(preview, {
      scale: 3,
      backgroundColor: bgColor,
      logging: false,
      windowWidth: preview.scrollWidth || 820,
      scrollY: 0,
      useCORS: false,
    });
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const filename = 'markdown-' + Date.now() + '.png';
    if (inTauri()) {
      await saveViaTauri(blob, filename, [{ name: 'PNG 图片', extensions: ['png'] }]);
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    }
    toast('长图已保存（3x 高清）');
  } catch(e) {
    const errMsg = (e && (e.message || e.stack || e)) || '未知错误';
    debugLog('PNG MSG: ' + ((e && e.message) || 'none'));
    debugLog('PNG export error: ' + (''+errMsg).substring(0, 500));
    toast('渲染失败：' + errMsg);
    console.error('[PNG export error]', e);
  } finally {
    if (header) header.style.display = headerDisp || '';
    if (batchPanel) batchPanel.style.display = batchDisp || '';
    if (wasEditMode) preview.contentEditable = 'true';
  }
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 1500);
}

loadDemo();

// ============ CSP-safe 事件绑定（Chrome Extension MV3 不允许 inline handler） ============
document.addEventListener('DOMContentLoaded', () => {
  // 建函数名 → 函数的映射
  const actions = {
    toggleEdit: () => toggleEdit(),
    loadDemo: () => loadDemo(),
    copyHTML: () => copyHTML(),
    copyRich: () => copyRich(),
    downloadHTML: () => downloadHTML(),
    downloadPDF: () => downloadPDF(),
    downloadPNG: () => downloadPNG(),
    togglePane: (arg) => togglePane(arg),
    applyTheme: () => applyTheme(),
    openBatch: () => openBatch(),
    closeBatch: () => closeBatch(),
    runBatch: () => runBatch(),
    pickSaveDir: () => pickSaveDir(),
  };

  document.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', () => {
      const fn = el.getAttribute('data-action');
      const argsRaw = el.getAttribute('data-args');
      const args = argsRaw ? argsRaw.replace(/^['"]|['"]$/g, '') : undefined;
      if (actions[fn]) actions[fn](args);
    });
  });

  document.querySelectorAll('[data-onchange]').forEach(el => {
    el.addEventListener('change', () => {
      const fn = el.getAttribute('data-onchange');
      if (actions[fn]) actions[fn]();
    });
  });

  // Chrome Extension: 读取右键菜单传来的选中文本
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get(['pendingContent'], (result) => {
      if (result.pendingContent) {
        const inp = document.getElementById('input');
        if (inp) {
          inp.value = result.pendingContent;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
        }
        chrome.storage.local.remove('pendingContent');
      }
    });
  }
});

// ============ 批量转换 · 拖拽/选文件 → 主题 → 下载 ============
const batchState = {
  files: [],   // {name, size, text, status: pending|done|error}
};

function openBatch() {
  // 填充主题下拉框（从主选择器同步）
  const src = document.getElementById('theme');
  const dst = document.getElementById('batch-theme');
  if (dst && src && dst.children.length === 0) {
    dst.innerHTML = src.innerHTML;
    dst.value = src.value;
  }
  document.getElementById('batch-panel').hidden = false;
  setupBatchListeners();
}

function closeBatch() {
  document.getElementById('batch-panel').hidden = true;
}

let batchListenersReady = false;
function setupBatchListeners() {
  if (batchListenersReady) return;
  batchListenersReady = true;

  const drop = document.getElementById('batch-drop');
  const input = document.getElementById('batch-file-input');

  ['dragenter', 'dragover'].forEach(ev =>
    drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag-over'); })
  );
  ['dragleave', 'drop'].forEach(ev =>
    drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag-over'); })
  );
  drop.addEventListener('drop', async e => {
    const items = Array.from(e.dataTransfer.items || []);
    const files = [];
    // 支持文件夹递归
    for (const item of items) {
      const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
      if (entry) {
        await walkEntry(entry, files);
      } else if (item.kind === 'file') {
        files.push(item.getAsFile());
      }
    }
    addBatchFiles(files);
  });
  input.addEventListener('change', () => {
    addBatchFiles(Array.from(input.files));
    input.value = '';
  });

  // ESC 关闭
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !document.getElementById('batch-panel').hidden) {
      closeBatch();
    }
  });

  // 点背景关闭
  document.getElementById('batch-panel').addEventListener('click', e => {
    if (e.target.id === 'batch-panel') closeBatch();
  });
}

// 递归遍历目录（拖拽文件夹）
function walkEntry(entry, out, prefix = '') {
  return new Promise(resolve => {
    if (entry.isFile) {
      entry.file(f => {
        // 用相对路径覆盖 name
        Object.defineProperty(f, '_relpath', { value: prefix + entry.name });
        out.push(f);
        resolve();
      });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      reader.readEntries(async entries => {
        for (const e of entries) {
          await walkEntry(e, out, prefix + entry.name + '/');
        }
        resolve();
      });
    } else {
      resolve();
    }
  });
}

async function addBatchFiles(files) {
  const allowedExt = /\.(md|markdown|txt)$/i;
  for (const f of files) {
    if (!allowedExt.test(f.name)) continue;
    if (f.size > 2 * 1024 * 1024) {
      alert(`跳过 ${f.name}：单文件超过 2MB`);
      continue;
    }
    try {
      const text = await f.text();
      batchState.files.push({
        name: f._relpath || f.name,
        size: f.size,
        text: text,
        status: 'pending',
      });
    } catch(e) {
      console.error('读取失败', f.name, e);
    }
  }
  renderBatchList();
}

function renderBatchList() {
  const ul = document.getElementById('batch-list');
  ul.innerHTML = '';
  batchState.files.forEach((it, idx) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="item-name">${escapeHtml(it.name)}</span>
      <span class="item-size">${(it.size / 1024).toFixed(1)} KB</span>
      <span class="item-status ${it.status}">${statusLabel(it.status)}</span>
      <button class="item-remove" title="移除">×</button>
    `;
    li.querySelector('.item-remove').addEventListener('click', () => {
      batchState.files.splice(idx, 1);
      renderBatchList();
    });
    ul.appendChild(li);
  });
  const count = batchState.files.length;
  document.getElementById('batch-count').textContent =
    count === 0 ? '未选择文件' : `${count} 个文件待转换`;
  document.querySelector('.batch-go').disabled = count === 0;
}

function statusLabel(s) {
  return s === 'pending' ? '待处理' : s === 'done' ? '完成' : '失败';
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

async function runBatch() {
  if (batchState.files.length === 0) return;

  const theme = document.getElementById('batch-theme').value;
  const format = document.getElementById('batch-format').value;  // html | pdf | png
  const mode = document.getElementById('batch-mode').value;      // single | zip
  const btn = document.querySelector('.batch-go');
  btn.disabled = true;

  // 保存当前状态，一会儿恢复
  const savedTheme = preview.className;
  const savedContent = input.value;

  // 拿一份克隆容器用来渲染每篇（不影响可见预览）
  // 但 downloadPDF/PNG 都从 #preview 抓 —— 直接借用主预览
  const outputs = [];   // {name, blob, ext}
  let i = 0;
  for (const item of batchState.files) {
    i++;
    btn.textContent = `处理中 ${i}/${batchState.files.length}…`;
    try {
      // 渲染这篇到主预览
      input.value = item.text;
      preview.innerHTML = marked.parse(item.text);
      preview.className = theme;
      // 让浏览器完成一次布局
      await new Promise(r => setTimeout(r, 60));

      const base = item.name.replace(/\.(md|markdown|txt)$/i, '');
      let blob, ext;

      if (format === 'html') {
        const html = buildStandaloneHTML();
        blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        ext = '.html';
      } else if (format === 'pdf') {
        blob = await renderBatchPDF();
        ext = '.pdf';
      } else if (format === 'png') {
        blob = await renderBatchPNG();
        ext = '.png';
      }

      outputs.push({ name: base + ext, blob });
      item.status = 'done';
    } catch(e) {
      console.error('转换失败', item.name, e);
      item.status = 'error';
    }
    renderBatchList();
  }

  // 恢复
  input.value = savedContent;
  preview.className = savedTheme;
  render();

  // 下载
  if (mode === 'zip') {
    if (typeof JSZip === 'undefined') {
      toast('打包库未加载');
      btn.disabled = false; btn.textContent = '转换并下载';
      return;
    }
    const zip = new JSZip();
    for (const o of outputs) {
      zip.file(o.name, o.blob);
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(zipBlob, `markdown-batch-${format}-${Date.now()}.zip`);
    toast(`已下载 zip · ${outputs.length} 个${format.toUpperCase()}文件`);
  } else {
    for (const o of outputs) {
      downloadBlob(o.blob, o.name);
      await new Promise(r => setTimeout(r, 250));   // 避免浏览器限流
    }
    toast(`已下载 ${outputs.length} 个 ${format.toUpperCase()}`);
  }

  btn.disabled = false;
  btn.textContent = '转换并下载';
}



// PDF 生成（从当前 preview 抓，返回 Blob）—— 复用 downloadPDF 的核心逻辑
async function renderBatchPDF() {
  const clone = preview.cloneNode(true);
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;top:0;left:-9999px;width:820px;background:#fff;z-index:-1;';
  clone.style.cssText = 'flex:none;overflow:visible;height:auto;max-height:none;padding:56px 64px 72px;width:820px;box-sizing:border-box;';
  wrap.appendChild(clone);
  document.body.appendChild(wrap);
  const bgColor = window.getComputedStyle(clone).backgroundColor || '#fff';
  try {
    const canvas = await html2canvas(clone, {
      scale: 3, useCORS: true, backgroundColor: bgColor,
      logging: false, windowWidth: 820, scrollY: 0,
    });
    const wPt = canvas.width * 72 / (96 * 3);
    const hPt = canvas.height * 72 / (96 * 3);
    const { jsPDF } = jspdf;
    const pdf = new jsPDF({
      orientation: hPt > wPt ? 'portrait' : 'landscape',
      unit: 'pt', format: [wPt, hPt], compress: true,
    });
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    pdf.addImage(imgData, 'JPEG', 0, 0, wPt, hPt, undefined, 'FAST');
    return pdf.output('blob');
  } finally {
    document.body.removeChild(wrap);
  }
}

// PNG 长图生成 —— 返回 Blob
async function renderBatchPNG() {
  const clone = preview.cloneNode(true);
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;top:0;left:-9999px;width:820px;background:#fff;z-index:-1;';
  clone.style.cssText = 'flex:none;overflow:visible;height:auto;max-height:none;padding:56px 64px 72px;width:820px;box-sizing:border-box;';
  wrap.appendChild(clone);
  document.body.appendChild(wrap);
  const bgColor = window.getComputedStyle(clone).backgroundColor || '#fff';
  try {
    const canvas = await html2canvas(clone, {
      scale: 3, useCORS: true, backgroundColor: bgColor,
      logging: false, windowWidth: 820, scrollY: 0,
    });
    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  } finally {
    document.body.removeChild(wrap);
  }
}

// ============ 全局拖拽 · 主页面直接扔文件进来 ============
let saveDirHandle = null;    // File System Access API 的目录 handle
let dragCounter = 0;

window.addEventListener('DOMContentLoaded', () => {
  const hint = document.getElementById('global-drop-hint');
  if (!hint) return;

  document.addEventListener('dragenter', e => {
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return;
    // 如果批量面板已经打开，不显示全局遮罩（避免叠加）
    if (!document.getElementById('batch-panel').hidden) return;
    dragCounter++;
    hint.classList.add('show');
  });
  document.addEventListener('dragover', e => {
    if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
      e.preventDefault();
    }
  });
  document.addEventListener('dragleave', e => {
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return;
    dragCounter = Math.max(0, dragCounter - 1);
    if (dragCounter === 0) hint.classList.remove('show');
  });
  document.addEventListener('drop', async e => {
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    dragCounter = 0;
    hint.classList.remove('show');
    // 如果批量面板已开，交给批量的 drop handler；否则我们自己处理
    if (!document.getElementById('batch-panel').hidden) return;

    const items = Array.from(e.dataTransfer.items || []);
    const files = [];
    for (const item of items) {
      const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
      if (entry) {
        await walkEntry(entry, files);
      } else if (item.kind === 'file') {
        files.push(item.getAsFile());
      }
    }

    // 过滤 md 文件
    const mds = files.filter(f => /\.(md|markdown|txt)$/i.test(f.name));
    if (mds.length === 0) {
      toast('未识别到 Markdown 文件');
      return;
    }

    // 单个文件：直接加载到当前编辑器
    // 多个文件：自动打开批量面板并塞进去
    if (mds.length === 1) {
      const text = await mds[0].text();
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      toast(`已加载 ${mds[0].name}（${(mds[0].size/1024).toFixed(1)} KB）`);
    } else {
      openBatch();
      // 等 DOM 准备好
      await new Promise(r => setTimeout(r, 100));
      addBatchFiles(mds);
      toast(`已加入批量：${mds.length} 个文件`);
    }
  });
});

// ============ 选择保存目录（File System Access API） ============
async function pickSaveDir() {
  const btn = document.getElementById('batch-dir-btn');
  const status = document.getElementById('batch-dir-status');

  // 如果已选，点一下取消
  if (saveDirHandle) {
    saveDirHandle = null;
    btn.classList.remove('on');
    btn.textContent = '选择保存目录';
    status.classList.remove('on');
    status.textContent = '默认下载到浏览器下载目录';
    return;
  }

  if (!window.showDirectoryPicker) {
    toast('当前环境不支持目录写入，回退为浏览器下载');
    return;
  }

  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    // 验证有写权限
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      const req = await handle.requestPermission({ mode: 'readwrite' });
      if (req !== 'granted') {
        toast('未授予写权限');
        return;
      }
    }
    saveDirHandle = handle;
    btn.classList.add('on');
    btn.textContent = '✓ ' + handle.name;
    status.classList.add('on');
    status.textContent = '将写入 ' + handle.name + '/';
    toast('已授权目录：' + handle.name);
  } catch(e) {
    if (e.name !== 'AbortError') {
      console.error(e);
      toast('目录选择失败');
    }
  }
}

// 重写 downloadBlob —— 如果有目录 handle 就直接写盘
async function downloadBlob(blob, filename) {
  if (saveDirHandle) {
    try {
      // 支持子路径 a/b/c.html
      const parts = filename.split('/').filter(Boolean);
      const fname = parts.pop();
      let dir = saveDirHandle;
      for (const p of parts) {
        dir = await dir.getDirectoryHandle(p, { create: true });
      }
      const fileHandle = await dir.getFileHandle(fname, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch(e) {
      console.error('直接写盘失败，回退到下载', e);
      // fallthrough → 走浏览器下载
    }
  }
  // 常规下载
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
