"""
dmgbuild settings — MarkdownForge 商业级 DMG

用法（由 make-dmg.sh 调用，环境变量传参）:
  dmgbuild -s scripts/dmgbuild-settings.py -D app=... -D bg=... -D pdf=... "MarkdownForge X.Y.Z" output.dmg

dmgbuild 直接写 .DS_Store 二进制（走 ds_store + mac_alias 库），
不依赖 macOS Finder AppleScript，规避 macOS 26 的 set-background-picture bug。
"""
import os

# defines 从命令行 -D 传入
app_path = defines.get('app')
bg_path = defines.get('bg')
pdf_path = defines.get('pdf')
icon_path = defines.get('icon')

# ─── 视觉配置 ───
format = 'UDZO'   # 压缩 + 只读
compression_level = 9

# 窗口
window_rect = ((200, 120), (1000, 600))   # 1000×600
icon_size = 128
text_size = 14
show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
sidebar_width = 0

# 背景
background = bg_path   # 绝对路径，dmgbuild 会拷进 .background/

# 内容 —— 3 个条目 + 系统 Applications 快捷方式
files = [app_path, pdf_path]
symlinks = { 'Applications': '/Applications' }
if icon_path:
    icon = icon_path   # .icns，作为 volume icon

# 图标坐标（与 dmg-bg.png 上的引导箭头对齐）
icon_locations = {
    os.path.basename(app_path):  (200, 230),
    'Applications':              (700, 230),
    os.path.basename(pdf_path):  (450, 460),
}

# 隐藏扩展名
hide_extension = [ os.path.basename(app_path) ]

# 默认视图
default_view = 'icon-view'
include_icon_view_settings = 'auto'
include_list_view_settings = 'auto'

# License / EULA 留空
license = None
