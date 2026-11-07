"""Downscale the rigged character's embedded 2048 base-colour texture to ../meshy/raw/texture-1024.jpg."""
import io
from pathlib import Path

import pygltflib  # pip install pygltflib pillow
from PIL import Image

RAW = Path(__file__).parent.parent / "meshy" / "raw"
gltf = pygltflib.GLTF2().load(str(RAW / "Character_output.glb"))
blob = gltf.binary_blob()
view = gltf.bufferViews[gltf.images[0].bufferView]
image = Image.open(io.BytesIO(blob[view.byteOffset : view.byteOffset + view.byteLength])).convert("RGB")
image.resize((1024, 1024), Image.LANCZOS).save(RAW / "texture-1024.jpg", quality=85, optimize=True)
