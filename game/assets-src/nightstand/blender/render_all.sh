#!/bin/bash
# Matched-camera renders, side-by-side / overlay vs ref, 4-angle turntables -> ../compare
# Needs Python with pillow + numpy (PYTHON=...).
set -e
cd "$(dirname "$0")"
B=${BLENDER:-blender}
PY=${PYTHON:-python3}
mkdir -p render ../compare
$B -b --python-exit-code 1 --python render.py -- ../export/nightstand-master.glb render/master 4 turn
$B -b --python-exit-code 1 --python render.py -- ../export/nightstand.glb render/lowpoly 4 turn
$PY compare.py render/master_000.png render/master "Blender master"
$PY compare.py render/lowpoly_000.png render/lowpoly "Low-poly"
cp render/master_side-by-side.png ../compare/side-by-side-master.png
cp render/master_overlay.png ../compare/overlay-master.png
cp render/lowpoly_side-by-side.png ../compare/side-by-side-lowpoly.png
cp render/lowpoly_overlay.png ../compare/overlay-lowpoly.png
$PY make_previews.py
mv ../compare/turntable.png ../compare/turntable-lowpoly.png
