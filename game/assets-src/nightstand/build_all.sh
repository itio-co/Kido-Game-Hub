#!/bin/bash
# Rebuild everything: parts -> master/low-poly GLBs -> matched-camera .blend -> renders + comparisons
set -e
cd "$(dirname "$0")"
B=${BLENDER:-blender}
$B -b --python-exit-code 1 --python build_master.py
$B -b --python-exit-code 1 --python finalize.py
$B -b --python-exit-code 1 nightstand-master.blend --python add_cam.py
rm -f *.blend1 _parts.blend
