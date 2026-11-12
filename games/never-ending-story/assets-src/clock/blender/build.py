"""Rebuild the editable clock source and texture-free runtime GLBs with Blender.

Run from any directory: blender -b --python assets-src/clock/blender/build.py
Add -- --render for matched-camera and front/side/back review images.
"""
from pathlib import Path
import bpy
import json
import math
import sys
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
ASSET = HERE.parent
GAME = ASSET.parent.parent
DIMS = json.loads((HERE / 'dims.json').read_text())
CAM = json.loads((HERE / 'cam.json').read_text())
W, H, D, FW = [DIMS[k] for k in ('width', 'height', 'depth', 'frameWidth')]
Q = (math.sqrt(2) - 1) / 2
SHAPE = [(-Q,.5),(Q,.5),(.5,Q),(.5,-Q),(Q,-.5),(-Q,-.5),(-.5,-Q),(-.5,Q)]
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene


def linear(v):
    return v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4


def material(name, color, roughness=.8):
    m = bpy.data.materials.new(name)
    rgb = [linear(int(color[i:i+2],16)/255) for i in (1,3,5)]
    m.diffuse_color = (*rgb,1)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*rgb,1)
    bs.inputs['Roughness'].default_value = roughness
    return m


wood = material('Walnut rim', '#71431f')
edge = material('Cut walnut bevel', '#8b552b')
inside = material('Inner frame shadow', '#58321a')
back = material('Plain walnut case back', '#623c24')
face = material('Warm ivory dial', '#cabc9e', .92)
hand = material('Dark brown hands', '#49321e', .65)


def mesh_part(name, vertices, faces, mats, face_mats=None, pivot=None):
    # Editable origins are part centres, except hands which rotate about the axle.
    if pivot is None:
        pivot = [(min(v[i] for v in vertices)+max(v[i] for v in vertices))/2 for i in range(3)]
    points = [tuple((v[i]-pivot[i])*.01 for i in range(3)) for v in vertices]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(points,[],faces)
    mesh.update()
    ob = bpy.data.objects.new(name, mesh)
    sc.collection.objects.link(ob)
    ob.location = Vector(pivot)*.01
    for mat in mats:
        mesh.materials.append(mat)
    if face_mats:
        for poly, mi in zip(mesh.polygons,face_mats): poly.material_index = mi
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    # Correct outward normals for all closed piece meshes.
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    ob.select_set(False)
    return ob


def prism(name, outline, yfront, yback, mat, pivot=None):
    n = len(outline)
    v = [(x,yfront,z) for x,z in outline] + [(x,yback,z) for x,z in outline]
    faces = [tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh_part(name,v,faces,[mat],pivot=pivot)


def octagon(width,height):
    return [(x*width,z*height+H/2) for x,z in SHAPE]


def make_hand(name,length,width,angle,y):
    # Broad shoulder, tapered tip, short counterweight. Pivot is the clock axle.
    outline = [(-width*.42,-1.5),(-width*.5,length*.55),(-width*.22,length-.65),
               (0,length),(width*.22,length-.65),(width*.5,length*.55),(width*.42,-1.5)]
    a = math.radians(angle)
    pts = [(x*math.cos(a)+z*math.sin(a),H/2-x*math.sin(a)+z*math.cos(a)) for x,z in outline]
    return prism(name,pts,y-.18,y+.18,hand,pivot=(0,y,H/2))


def create_variant(variant):
    label = 'LowPoly' if variant == 'lowpoly' else 'Master'
    coll = bpy.data.collections.new(f'Clock_{label}')
    sc.collection.children.link(coll)
    root = bpy.data.objects.new(f'Clock_{label}', None)
    coll.objects.link(root)
    root['assetId'] = 'a4c0e001-0000-4000-8000-00000000001c'
    root['slug'] = 'flow/living-room/clock'
    root['dimensionsAreEstimated'] = True
    root['reference'] = 'img/living-wide.jpg: crop (48, 108, 96, 108)'
    parts = [prism('Clock_Back',octagon(W-.4,H-.4),D/2-.65,D/2,back)]
    # One independently editable mitred segment for each octagonal frame edge.
    profile = [(W-.4,H-.4,D/2),(W,H,-D/2+.65),(W-.6,H-.6,-D/2),
               (W-2*FW,H-2*FW,-D/2),(W-2*FW-.9,H-2*FW-.9,-1.4),
               (W-2*FW-.9,H-2*FW-.9,D/2)]
    for i in range(8):
        j=(i+1)%8
        v=[]
        for width,height,y in profile:
            for k in (i,j):
                x,z=SHAPE[k]
                v.append((x*width,y,z*height+H/2))
        faces=[]
        for p in range(len(profile)):
            n=(p+1)%len(profile)
            faces.append((2*p,2*p+1,2*n+1,2*n))
        faces.extend([tuple(range(0,len(v),2)),tuple(range(len(v)-1,0,-2))])
        parts.append(mesh_part(f'Clock_Frame_{i+1:02}',v,faces,[wood,edge,inside],[0,1,0,1,2,2,0,0]))
    parts.append(prism('Clock_Dial',octagon(W-2*FW,H-2*FW),-1.52,-.85,face))
    time = DIMS['handTime']
    hour_angle = (time['hour']%12)*30 + time['minute']*.5
    minute_angle = time['minute']*6
    parts += [make_hand('Hand_Hour',11,1.65,hour_angle,-1.9),
              make_hand('Hand_Minute',15.25,.9,minute_angle,-2.27)]
    hub_outline = [(math.sin(a*math.tau/16)*1.55,H/2+math.cos(a*math.tau/16)*1.55) for a in range(16)]
    parts.append(prism('Hand_Hub',hub_outline,-2.65,-2.35,hand,pivot=(0,-2.5,H/2)))
    for ob in parts:
        for old in list(ob.users_collection): old.objects.unlink(ob)
        coll.objects.link(ob)
        ob.parent = root
        ob['partName'] = ob.name.split('.')[0]
        if variant == 'master':
            bevel = ob.modifiers.new('Small crafted edge bevel','BEVEL')
            bevel.width = .00065
            bevel.segments = 2
            bevel.affect = 'EDGES'
            bevel.limit_method = 'ANGLE'
            bevel.angle_limit = math.radians(25)
            bpy.context.view_layer.objects.active = ob
            bpy.ops.object.modifier_apply(modifier=bevel.name)
        # Keep exported labels identical across variants; collection separates source variants.
    return coll,root,parts


variants = {}
report = {}
for variant in ('lowpoly','master'):
    if variant == 'master':
        for previous in variants['lowpoly'][2]:
            previous.name = previous['partName'] + '_LowPolySource'
    coll,root,parts = create_variant(variant)
    variants[variant] = (coll,root,parts)
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    # Export stable labels in both variants; the source collections remain separate.
    for ob in parts: ob.select_set(True)
    suffix = '' if variant == 'lowpoly' else '-master'
    out = ASSET / f'export/clock{suffix}.glb'
    bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,
                             export_yup=True,export_extras=True,export_cameras=False,
                             export_lights=False,export_materials='EXPORT')
    (GAME / f'public/models/clock{suffix}.glb').write_bytes(out.read_bytes())
    tris=sum(sum(len(p.vertices)-2 for p in ob.data.polygons) for ob in parts)
    report[variant] = {'file': f'export/clock{suffix}.glb', 'triangles': tris,
                       'parts': len(parts),'bytes': out.stat().st_size}
    for ob in [root,*parts]: ob.hide_render = True

# A packed reference in the saved .blend avoids fragile absolute image paths.
R = Matrix(CAM['R'])
C = Vector(CAM['C'])*.01
cd = bpy.data.cameras.new('MatchCam')
cd.sensor_width = 36
cd.sensor_fit = 'HORIZONTAL'
cd.lens = CAM['p'][5]/CAM['IW']*36
cd.clip_start=.01
camera = bpy.data.objects.new('MatchCam',cd)
sc.collection.objects.link(camera)
camera.matrix_world = Matrix.Translation(C) @ (R.transposed() @ Matrix(((1,0,0),(0,-1,0),(0,0,-1)))).to_4x4()
sc.camera = camera
image = bpy.data.images.load(str(ASSET / 'ref/clock-ref.png'))
image.pack()
cd.show_background_images=True
bg=cd.background_images.new()
bg.image=image
bg.alpha=.5
bg.display_depth='FRONT'
world=bpy.data.worlds.new('Warm studio')
world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.78,.83,.9,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.65
sc.world=world
ld=bpy.data.lights.new('Soft upper-left key','AREA')
ld.energy=45
ld.shape='DISK'
ld.size=1.5
light=bpy.data.objects.new('Soft upper-left key',ld)
sc.collection.objects.link(light)
light.location=(-.6,-1,.9)
light.rotation_euler=(Vector((0,0,H/200))-light.location).to_track_quat('-Z','Y').to_euler()
sc.render.engine='CYCLES'
sc.cycles.samples=32
sc.cycles.use_denoising=False  # Works in distro builds without OpenImageDenoise.
sc.render.film_transparent=True
sc.render.image_settings.file_format='PNG'
sc.render.image_settings.color_mode='RGBA'
sc.view_settings.view_transform='Standard'
sc.render.resolution_x=CAM['IW']*4
sc.render.resolution_y=CAM['IH']*4
sc.render.resolution_percentage=100
# Master visible by default; low-poly source retained as a separate hidden collection.
for variant,(coll,root,parts) in variants.items():
    for ob in [root,*parts]:
        ob.hide_render=variant!='master'
        ob.hide_set(variant!='master')
bpy.ops.object.select_all(action='DESELECT')
sc['assetNotes']='Reference-matched first 3D interpretation; physical dimensions and hidden case-back are estimated. Hands can rotate independently about their axle.'
bpy.ops.wm.save_as_mainfile(filepath=str(HERE / 'clock-master.blend'))
(ASSET / 'export/build-report.json').write_text(json.dumps(report,indent=2)+'\n')
print('CLOCK_BUILD_REPORT',json.dumps(report))

if '--render' in sys.argv:
    for variant,(coll,root,parts) in variants.items():
        for v,(_,r,ps) in variants.items():
            for ob in [r,*ps]: ob.hide_render=v!=variant
        sc.render.filepath=str(ASSET / f'compare/matched-{variant}.png')
        bpy.ops.render.render(write_still=True)
    sc.render.resolution_x=512
    sc.render.resolution_y=512
    cd.lens=52
    for name,location in [('front',(0,-1,.21)),('three-quarter',(-.65,-.9,.55)),('rear',(.55,.9,.48))]:
        camera.location=location
        camera.rotation_euler=(Vector((0,0,H/200))-camera.location).to_track_quat('-Z','Y').to_euler()
        sc.render.filepath=str(ASSET / f'compare/{name}.png')
        bpy.ops.render.render(write_still=True)
