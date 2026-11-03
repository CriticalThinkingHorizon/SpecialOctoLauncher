from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parent

# Generate Moonlight S2 Icon
im = Image.new('RGBA', (256, 256), (12, 16, 24, 255))
d = ImageDraw.Draw(im)

d.rounded_rectangle((16, 16, 240, 240), radius=36, fill=(18, 26, 38), outline=(0, 210, 180), width=6)
d.rounded_rectangle((28, 28, 228, 228), radius=28, fill=(14, 20, 30), outline=(20, 80, 110), width=2)

# Crescent Moon
d.ellipse((60, 55, 175, 170), fill=(0, 230, 200))
d.ellipse((85, 45, 195, 155), fill=(14, 20, 30))

# D-pad (left)
d.rectangle((64, 182, 88, 194), fill=(0, 180, 216))
d.rectangle((70, 176, 82, 200), fill=(0, 180, 216))

# Buttons (right)
d.ellipse((168, 182, 178, 192), fill=(0, 230, 160))
d.ellipse((182, 172, 192, 182), fill=(0, 210, 240))
d.ellipse((154, 172, 164, 182), fill=(0, 180, 216))
d.ellipse((168, 162, 178, 172), fill=(0, 255, 200))

d.rounded_rectangle((86, 202, 170, 228), radius=8, fill=(0, 190, 165))
try:
    font = ImageFont.truetype('C:/Windows/Fonts/consola.ttf', 18)
    d.text((106, 205), 'S2 PC', font=font, fill=(10, 16, 22))
except:
    pass

im.save(root / 'assets/icon.png')
print('Moonlight S2 assets generated successfully.')
