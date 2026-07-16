# AGENTS.md — MarkdownForge 项目约束书

> Codex CLI 启动时自动读这份文件。MarkdownForge 是三载体 markdown 排版工具（Tauri v2 桌面 + Chrome MV3 扩展 + Standalone 单文件 HTML）。

---

## 一、项目位置与三载体架构

**真项目根**：`/Users/kimliu/Downloads/workspace/markdownforge/`（Tauri v2 桌面工程）

**目录心智模型**：

```
markdownforge/                          # 真项目根（本文件所在）
├── src-frontend/                       # 前端真源（Tauri build 打这个）
│   ├── index.html / body.html          # 主页面 + Chrome 扩展 body
│   ├── main.css (2848 行)              # 26 主题，含 stage 舞台主题
│   ├── core.js (1378 行)               # 双向编辑 + Tauri 集成 + 拖放 + divider
│   └── libs/                           # marked · html2canvas-pro · jsPDF · turndown 全部本地
├── src/                                # Rust 后端（Tauri v2）
├── scripts/
│   ├── build-release.sh                # 7 门禁一键打商业级 DMG
│   ├── release-push.sh                 # 双端 Release 推送
│   ├── rollback.sh                     # 回滚到旧 tag
│   ├── make-dmg.sh                     # dmgbuild 单独调用
│   ├── build-manual-pdf.sh             # 用自己应用渲染使用说明 PDF
│   └── gen-dmg-bg.py                   # DMG 背景图生成
├── dmg-assets/                         # 使用说明.md/.pdf + 1000x600 背景图
├── dist-release/                       # DMG 产物（进 .gitignore）
└── target/                             # cargo 编译产物（进 .gitignore）
```

**外部参考源**：`~/Documents/MarkdownForge/`
- `shared/` — 精简版前端源（给独立 HTML / 扩展看的）
- `standalone/MarkdownForge.html` — 单文件全内嵌版
- `extension/` — Chrome MV3 扩展目录
- `legacy/` — v1.x 归档，**只读，禁改**

---

## 二、常用命令

```bash
# 开发
cargo tauri dev                          # Tauri 开发模式

# 打包 · 商业级 DMG（v2.1.0 已跑通）
bash scripts/build-release.sh            # 7 门禁 + DMG 一键出片，5-10 分钟

# 发布 · 双端 Release（GITEE_TOKEN 已在 ~/.zshrc）
bash scripts/release-push.sh v2.1.0 /tmp/release-notes-2.1.0.md

# 手工验证
mdfind "kMDItemFSName == 'MarkdownForge.app'"   # 应只返回 /Applications/ 一条
codesign --verify --deep --strict /Applications/MarkdownForge.app
open dist-release/MarkdownForge-2.1.0-macOS-AppleSilicon.dmg

# 回滚到 v1.0.5
bash scripts/rollback.sh v1.0.5
```

**Chrome 扩展**：改完 `~/Documents/MarkdownForge/extension/` 后，到 chrome://extensions/ 点↻刷新，关掉旧 tab 重开。

**Standalone HTML**：改完 `~/Documents/MarkdownForge/standalone/MarkdownForge.html` 直接 `open` 就是最新的。

---

## 三、三载体同步铁律（重要）

**同步方向**：

```
src-frontend/ (真源) ──patch──> ~/Documents/MarkdownForge/shared/
                    ──cp────> ~/Documents/MarkdownForge/extension/*.{html,css,js}
                    ──patch─> ~/Documents/MarkdownForge/standalone/MarkdownForge.html
```

**禁止事项**：

- ❌ 用 `rsync -a ~/Documents/MarkdownForge/shared/ src-frontend/` **反向覆盖真源** —— 会丢：
  - Tauri 集成（`inTauri()` / `saveViaTauri` / 拖放 listener）
  - divider 拖拽栏（`#divider` + `--split` CSS 变量 + flex 布局）
  - hint 副标题（`<span class="hint">小柳 markdown2png · 中文优化排版</span>`）
  - E2E 会立刻炸 `T1_header_subtitle` / `T2_divider_exists` / `T3_divider_resizes`

- ✅ **正确做法**：用 `patch` 精准改：
  - `extractPreviewCSS` + `buildStandaloneHTML`（core.js）
  - 追加新主题 CSS 段到 main.css 末尾
  - 插入新 `<option>` 到 index.html / body.html

---

## 四、主题体系（当前 26 套）

| 分组 | 主题 |
|---|---|
| 基础 | 默认 · 书籍 · 米黄 · 深色 |
| 极简 | 无印良品 |
| 中国风 | 宣纸 · 青瓷 · 竹青 · 胭脂 |
| 平台风格 | 微信 · 小红书 · 掘金 · 知乎 · GitHub · 报纸 · 打字机 |
| 高端设计 | 法律文书 · Notion · Apple · Stripe · Vercel · Ant Design · Ant Dark · Linear · Qwen 科技 |
| **视觉化** | **舞台（stage · 暗色·宋体金）** |

**stage 主题特色**：
- CSS counter 自动 H2 加金色 01/02 序号
- pre 代码块自动 STAGE·NN 右下角标
- blockquote 变金色左边线机制卡
- 支持内嵌 `<div class="stage-frame"><svg>` + 预设动画 class（`st-anim-bob/pulse/fly-*/spark`）
- `@supports (animation-timeline: view())` 滚动淡入，下载 HTML 离线仍生效

**加新主题步骤**：
1. 在 `src-frontend/main.css` 末尾追加 `#preview.xxxname {...}` 段
2. 在 `src-frontend/index.html` + `body.html` 的 select 里加 `<option value="xxxname">`
3. 如果新主题要用 h2::before / pre box-shadow / blockquote border-left，**必须在主题段尾部加 !important 豁免层**覆盖全局 wipe（详见 main.css 第 970 行附近的"全局清理"注释）
4. 如果新主题要用 `@keyframes` 全局动画，命名加 `st-` 前缀就能被 `extractPreviewCSS()` 自动带到下载 HTML
5. 同步：`cp` 三份到 `~/Documents/MarkdownForge/{shared,extension}/`，patch 到 `standalone/MarkdownForge.html`

---

## 五、发布流程

**Stage 1 · 本地冻结（build-release.sh 自动跑）**

```
门禁 P (html2canvas-pro 检查)
  └─ src-frontend/libs/html2canvas.min.js 必须是 -pro 版本
门禁 S (Spotlight 残留清理)
  └─ 清 target/ + 父级 target/ + mdfind 报警
cargo tauri build --bundles app
  └─ 12M .app
门禁 T (E2E 冒烟 10 项)
  └─ T1 hint / T2 divider / T3 divider resize / T4-T10 主题切换 · 复制 · 导出
门禁 G (零外部引用 3 层)
  └─ 内嵌资源 grep + 源码 CDN grep + otool -L brew 检查
门禁 C (ad-hoc codesign)
  └─ codesign --sign - + verify --deep --strict
dmgbuild
  └─ 1000x600 背景图 + Applications + 使用说明.pdf
门禁 D (create-dmg 卡资源忙兜底，MarkdownForge 用 dmgbuild 一般不触发)
门禁 S 收尾 (清 target/ 里的 build 产物)
门禁 V (git commit + tag vX.Y.Z)
```

**Stage 2 · 手工验（离线）**

- 装 DMG 到 /Applications
- 打开跑一遍 markdown 输入 → 切主题 → 复制富文本 → 导 PDF → 导长图 → 批量
- xattr 去 Gatekeeper（首次）

**Stage 3 · 显式推双端**

```bash
bash scripts/release-push.sh v2.1.0 /tmp/release-notes-2.1.0.md
```

- 推 tag + main 到 gitee + github
- gh release create + DMG 上传（GitHub）
- Gitee REST API 建 release + attach_files（幂等，已存在则追加附件）

---

## 六、发布产物交付位置

**用户下载目录**：`~/Downloads/软件/`

每次 v2.1.0 之后的发布应更新以下四个文件：

- `MarkdownForge-x.y.z-macOS-AppleSilicon.dmg` （4-5M）
- `MarkdownForge-x.y.z-Chrome-Extension.zip` （250-350K）
- `MarkdownForge-x.y.z-standalone.html` （900K-1M）
- `MarkdownForge-使用说明.pdf` （600-700K）

---

## 七、技术栈

- **前端**：原生 HTML + JS ES 2020+ + `libs/` 本地依赖（marked v15 · highlight.js · html2canvas-pro · jsPDF · jsZip · turndown · GFM）
- **桌面**：Tauri v2 + Rust（`tauri-plugin-clipboard-manager` · `tauri-plugin-dialog` · `tauri-plugin-fs` · `tauri-plugin-global-shortcut`）
- **扩展**：Chrome MV3（`background.js` + `data-action` 属性绑定，禁止 inline handler）
- **打包**：`dmgbuild` (Python) + `create-dmg` (bash 兜底)
- **中国网络**：Cargo 走 rsproxy.cn；GitHub 走 hosts + SSH 443

---

## 八、用户审美硬规则

**加粗**只加 `font-weight`，不加颜色/下划线/波浪线/背景高亮。

**装饰符号**：正文/标题禁 emoji；无红色 ✗/✅；H1 下 H2 前**不加** ❋❈❯◆ 花饰。

**列表项**前面**不要**圆点、方块、菱形、短横线任何装饰。

**引用块 + 代码块**：**不要**左侧竖线（stage 主题是例外，用金色左边线做机制卡，属于设计语言不是装饰）。

**任务清单**：隐藏 checkbox 方框，已完成灰色删除线（不用主题色）。

**注释**：`*斜体*`（自动淡 opacity 0.75），不用 `（注：xxx）`。

**分隔线**：极淡居中细线代替 ❈❈❈ / ◆◆ / 心花饰。

**审美方向**：淡雅、极简、中国风（宣纸 / 青瓷 / 竹青 / 胭脂 / MUJI）。**强调靠字重和留白，不靠彩色**。

**PDF**：单页贴合内容不分 A4；长图 3x 高清；深色主题下载 HTML 用深底 `#0b0e14` 不用灰底 `.page` 白卡包裹。

---

## 九、给 Codex 的操作提示

1. **默认沉默不做 reasoning preamble** — 第一句给结果或动手，禁用"我来看看/让我检查/根据我的分析"
2. **中文输出** — 所有对话必须中文
3. **视觉验证** — 做完前端改动**必须**用浏览器（或 headless Chrome + playwright + `vision_analyze`）验证一遍，不许"看代码觉得对"就交
4. **门禁验证** — 发布类改动**必须**跑 `bash scripts/build-release.sh` 全绿再说完
5. **同步三载体** — 前端改完必须同步到 `~/Documents/MarkdownForge/{shared,extension,standalone}/`
6. **patch 不覆盖** — 跨载体同步用 `patch (mode='replace')`，不整文件 `cp`
7. **发布走三阶段** — 别 `git push --tags` 一步到位，走 `build-release.sh` → 用户装 DMG 验 → `release-push.sh`
8. **skill 加载** — 关键 skill：`commercial-dmg-packaging` · `dual-remote-release-workflow` · `vibecoding-constraint`

---

## 十、变更历史

- **2026-07-16** · v2.1.0 · 加 stage 舞台主题 + Qwen 科技主题；build-release.sh 7 门禁全绿；双端 Release 已推

---

*此文件由 Codex CLI 启动时自动读取，是本项目的权威约束。改动请 commit。*
