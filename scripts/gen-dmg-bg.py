#!/usr/bin/env python3
"""生成 DMG 背景图 —— 商业级布局
布局对应 make-dmg.sh 中的 icon 坐标：
  MarkdownForge.app   x=200 y=230
  Applications        x=700 y=230
  使用说明.pdf         x=450 y=460
窗口 1000x600
"""
from PIL import Image, ImageDraw, ImageFont
import os, sys

W, H = 1000, 600
BG = (247, 240, 224)
INK = (55, 50, 40)
DIM = (140, 130, 110)
FAINT = (215, 205, 185)

img = Image.new('RGB', (W, H), BG)
d = ImageDraw.Draw(img)

CANDS = [
    '/System/Library/Fonts/PingFang.ttc',
    '/System/Library/Fonts/STHeiti Medium.ttc',
    '/System/Library/Fonts/Hiragino Sans GB.ttc',
]
fp = next((p for p in CANDS if os.path.exists(p)), None)
if not fp: raise SystemExit('no CJK font')

f_title = ImageFont.truetype(fp, 40)
f_sub   = ImageFont.truetype(fp, 18)
f_hint  = ImageFont.truetype(fp, 15)
f_arrow = ImageFont.truetype(fp, 36)

# 顶部标题区
d.text((W//2, 65), 'MarkdownForge', font=f_title, fill=INK, anchor='mm')
d.text((W//2, 108), '离线运行 · 中文优化排版 · 25 套主题', font=f_sub, fill=DIM, anchor='mm')
d.line([(280, 145), (W-280, 145)], fill=FAINT, width=1)

# 主拖拽动线：图标坐标是 (200, 230) app  →  (700, 230) Applications
# 中间画一根引导箭头（在图标下方 y≈340 处，不挡图标名）
arrow_y = 350
# 长横线
d.line([(310, arrow_y), (620, arrow_y)], fill=INK, width=2)
# 箭头三角
d.polygon([(620, arrow_y-8), (620, arrow_y+8), (640, arrow_y)], fill=INK)
# 箭头下方文字
d.text(((310+640)//2, arrow_y+25), '拖入 Applications 完成安装', font=f_hint, fill=INK, anchor='mm')

# 底部分隔 + PDF 区提示
d.line([(280, 420), (W-280, 420)], fill=FAINT, width=1)
d.text((W//2, 545), '双击 使用说明.pdf 查看功能详解 · 首次打开如提示"无法验证开发者"请到 系统设置 → 隐私与安全性 允许',
       font=f_hint, fill=DIM, anchor='mm')

out = sys.argv[1] if len(sys.argv) > 1 else 'dmg-bg.png'
img.save(out, 'PNG', optimize=True)
print(f'saved {out}  {W}x{H}')

img2 = img.resize((W*2, H*2), Image.LANCZOS)
out2 = out.replace('.png', '@2x.png')
img2.save(out2, 'PNG', optimize=True)
print(f'saved {out2}  {W*2}x{H*2}')
