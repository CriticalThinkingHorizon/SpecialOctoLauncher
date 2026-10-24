from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json

root=Path(__file__).resolve().parent
font_paths=['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 'C:/Windows/Fonts/arial.ttf', 'C:/Windows/Fonts/segoeui.ttf']
font=None
for p in font_paths:
 if Path(p).exists():
  font=p
  break

items = ['rom:/', 'sd:/', 'system:/', 'save:/', 'cache:/']
s2_files_path = root.parent.parent / 'runs/latest/s2-files.json'
if s2_files_path.exists():
 try:
  data = json.loads(s2_files_path.read_text())
  if data:
   items = [f"{d['mount']}{d['name']} [{d['type']}] ({d['size']}B)" for d in data[:7]]
 except Exception:
  pass

atlas=Image.new('L',(1024,2048));draw=ImageDraw.Draw(atlas);header=[];y=2

labels = [('TITLE', 'S2 File Explorer (nn::fs)', 40), ('SUBTITLE', 'Accessible Console Storage', 22), ('HINT', 'D-Pad: Navigate | A: Open | B: Back', 20)]
for name,label,size in labels:
 face=ImageFont.truetype(font,size) if font else ImageFont.load_default()
 box=draw.textbbox((0,0),label,font=face);w,h=box[2]-box[0],box[3]-box[1]
 draw.text((2-box[0],y-box[1]),label,font=face,fill=255)
 header.append(f'const ivec4 TEXT_{name} = ivec4(2, {y}, {w}, {h});');y+=h+8

for i, item in enumerate(items[:7]):
 face=ImageFont.truetype(font,20) if font else ImageFont.load_default()
 box=draw.textbbox((0,0),item,font=face);w,h=box[2]-box[0],box[3]-box[1]
 draw.text((2-box[0],y-box[1]),item,font=face,fill=255)
 header.append(f'const ivec4 ITEM_{i} = ivec4(2, {y}, {w}, {h});');y+=h+8

(root/'assets/text.bin').write_bytes(atlas.tobytes());(root/'shaders/text.glsl').write_text('\n'.join(header)+'\n')
im=Image.new('RGBA',(256,256),(14,37,58,255));d=ImageDraw.Draw(im)
d.rounded_rectangle((26,42,230,214),radius=22,fill=(24,65,85),outline=(64,215,224),width=5)
im.save(root/'assets/icon.png')
