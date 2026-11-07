"""Background removal used to make the Meshy input (first step only).

The source art is public/img/living-grandma.jpg (720x1280). rembg's u2net_human_seg and
isnet-general-use masks were compared; the chosen cutout was then cropped to the figure,
cleaned up and padded to a 1224x1224 transparent square. The committed grandma-cutout.png is
the exact file that was sent to Meshy.

    pip install rembg pillow && python cut.py
"""
from pathlib import Path

from PIL import Image
from rembg import new_session, remove

HERE = Path(__file__).parent
SRC = HERE.parents[2] / "public" / "img" / "living-grandma.jpg"

image = Image.open(SRC).convert("RGB")
for model in ["u2net_human_seg", "isnet-general-use"]:
    remove(image, session=new_session(model)).save(HERE / f"cut_{model}.png")
