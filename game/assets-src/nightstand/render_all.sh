#!/bin/bash
# Matched-camera renders + comparisons + 4-angle turntables for master and low-poly.
# Needs Python with pillow + numpy for compare.py / make_previews.py.
set -e
cd "$(dirname "$0")"
B=${BLENDER:-blender}
PY=${PYTHON:-python3}
mkdir -p render
$B -b --python-exit-code 1 --python render.py -- nightstand-master.glb render/master 4 turn
$B -b --python-exit-code 1 --python render.py -- nightstand.glb render/lowpoly 4 turn
$PY compare.py render/master_000.png render/master "Blender master"
$PY compare.py render/lowpoly_000.png render/lowpoly "Low-poly"
cp render/master_side-by-side.png side-by-side-master.png
cp render/master_overlay.png overlay-master.png
cp render/lowpoly_side-by-side.png side-by-side.png
cp render/lowpoly_overlay.png overlay-lowpoly.png
$PY make_previews.py
