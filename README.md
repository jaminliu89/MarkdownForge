# MarkdownForge

**离线运行的 Markdown 精美排版桌面应用 · 25 套主题 · 单页矢量 PDF · 3x 高清长图**

macOS Tauri v2 桌面应用，中文优化排版。完全离线，零外部依赖。

---

## 特性

- **25 套主题**：默认/书籍/米黄/深色 · 无印良品 · 宣纸/青瓷/竹青/胭脂（中国风）· 微信/小红书/掘金/知乎/GitHub/报纸/打字机（平台）· 法律文书/Notion/Apple/Stripe/Vercel/Ant Design/Linear（高端）
- **双向编辑**：预览区可直接改，同步回左栏
- **一键导出**：HTML · 富文本 · 单页贴合 PDF · 3x 高清长图 · 批量转换 zip
- **全局快捷键**：`⌘⇧M` 呼出窗口
- **零外部引用**：所有渲染库（marked / highlight.js / html2canvas-pro / jsPDF / jsZip / turndown）内嵌进 app
- **命令行工具**：配套 `md2pdf`（另仓）走 Chrome headless 生成矢量单页 PDF

---

## 排版铁律

- 加粗只加字重不变色
- 引用块 / 代码块无左侧竖线
- 列表无前置符号（无圆点/方块/菱形/短横线）
- 任务清单隐藏 checkbox 方框，已完成用灰色删除线
- 分隔线极淡短细线
- 无 emoji 装饰
- 注释用 *斜体*

任何新增主题必须遵守。

---

## 目录

```
markdownforge/
├── src/                       Rust 后端 (Tauri 2)
├── src-frontend/              前端源（自包含，无 CDN）
│   ├── index.html
│   ├── core.js
│   ├── main.css
│   ├── body.html
│   └── libs/                  marked / hljs / html2canvas-pro / jspdf / jszip / turndown
├── capabilities/              Tauri 权限
├── icons/                     应用图标
├── scripts/
│   ├── gen-dmg-bg.py          DMG 背景图（PIL）
│   ├── build-manual-pdf.sh    使用说明 PDF（Chrome headless）
│   ├── make-dmg.sh            create-dmg 打包
│   └── build-release.sh       一键流水线
├── dmg-assets/
│   ├── 使用说明.md
│   ├── 使用说明.pdf
│   └── dmg-bg.png (+ @2x)
├── build.rs
├── Cargo.toml
└── tauri.conf.json
```

---

## 开发

### 前置

```bash
# Rust + Tauri CLI
cargo install tauri-cli --version "^2.0" --locked

# 中国网络必配 cargo 镜像
mkdir -p ~/.cargo
cat > ~/.cargo/config.toml <<'EOF'
[source.crates-io]
replace-with = 'rsproxy-sparse'

[source.rsproxy-sparse]
registry = "sparse+https://rsproxy.cn/index/"

[registries.rsproxy]
index = "https://rsproxy.cn/crates.io-index"

[net]
git-fetch-with-cli = true
EOF

# 打包工具
brew install create-dmg
pip3 install --user Pillow
```

### 开发模式

```bash
cargo tauri dev
```

### 编译（仅 .app）

```bash
cargo tauri build --bundles app
# 产物: target/release/bundle/macos/MarkdownForge.app
```

### 商业级 DMG 一键出

```bash
bash scripts/build-release.sh
# 产物: dist-release/MarkdownForge-1.0.0-macOS-AppleSilicon.dmg
```

流水线四步：
1. `cargo tauri build --bundles app`
2. `python3 scripts/gen-dmg-bg.py` — 生成米黄色中式背景图（1000x600 + @2x）
3. `bash scripts/build-manual-pdf.sh` — 用应用自己渲染使用说明（吃狗粮），Chrome headless 打矢量 PDF
4. `bash scripts/make-dmg.sh` — create-dmg 组合 .app + 使用说明.pdf + Applications 快捷方式

---

## 安装

1. 双击 `MarkdownForge-*.dmg` 挂载
2. 将 `MarkdownForge.app` 拖入 `Applications`
3. **首次打开**：如果 macOS 提示"无法验证开发者"，跑：
   ```bash
   xattr -dr com.apple.quarantine /Applications/MarkdownForge.app
   ```
   或到「系统设置 → 隐私与安全性」允许打开
4. 详细功能见 DMG 内的「使用说明.pdf」

---

## 已知坑（都已修）

- **html2canvas P3 色域**：macOS 显示器的 P3 广色域会让 WKWebView 把颜色 serialize 成 `color(display-p3 …)`，旧版 html2canvas 崩。已换成 **html2canvas-pro 1.5.11**，支持 CSS Color Level 4。
- **Tauri WKWebView 不支持 `<a download>`**：所有导出走 Rust 命令 `save_blob_base64` + tauri-plugin-dialog 弹原生保存对话框。
- **函数名 `isTauri()` 会撞 Tauri 内置全局**：用 `inTauri()` 代替。
- **DMG 打包失败**：清残留 `/Volumes/MarkdownForge*` 挂载卷和 `rw.*.dmg` 中间文件。

---

## 许可

个人使用。

*版本 1.0.0*
