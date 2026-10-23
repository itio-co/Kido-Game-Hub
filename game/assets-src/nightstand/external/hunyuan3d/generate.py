"""Call the public Hunyuan3D-2 Space (shape only) for the nightstand reference; writes seed<N>.glb.

    python generate.py <image.png> <out_dir> <seed> [seed ...]      (needs: pip install gradio_client)

Settings from ../../prompt.md (rembg off, octree 256, fixed seed); steps 50 / guidance 7.5.
Shape-only costs ~6 s of ZeroGPU; texture generation needs more quota than an anonymous user gets.
"""
import sys, shutil, urllib.request
from gradio_client import Client, handle_file
img, out = sys.argv[1], sys.argv[2]
c = Client('tencent/Hunyuan3D-2')
for seed in map(int, sys.argv[3:]):
    r = c.predict(caption=None, image=handle_file(img), steps=50, guidance_scale=7.5, seed=seed,
                  octree_resolution=256, check_box_rembg=False, num_chunks=8000, randomize_seed=False,
                  api_name='/shape_generation')
    p = r[0]['value'] if isinstance(r[0], dict) else r[0]
    if p.startswith('/tmp/gradio'):  # server path: fetch it
        urllib.request.urlretrieve('https://tencent-hunyuan3d-2.hf.space/file=' + p, f'{out}/seed{seed}.glb')
    else:
        shutil.copy(p, f'{out}/seed{seed}.glb')
    print(seed, r[2]['number_of_faces'], 'faces')
