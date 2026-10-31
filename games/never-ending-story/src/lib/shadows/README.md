# Shadow system (`src/lib/shadows`)

Runtime 2D shadows for layered scenes. Colour layers and the bare room carry **no baked shadows**; every shadow is generated
from the caster's alpha each time the light, visibility or position changes, so shadows follow moved or hidden objects.

## Data (`layers.json`)

```jsonc
{
  "light": { "shadowAngleDeg": 300, "elevationDeg": 40, "softness": 0.5, "intensity": 0.7, "color": "#3a2a35" },
  "layers": [
    { "name": "sofa", "x": 0, "y": 0, "w": 0, "h": 0, "z": 20,
      "shadow": { "type": "ground-drop", "floorY": 812, "scale": 1, "blur": 1, "opacity": 1, "contact": 0.9, "offset": [0, 0] } }
  ]
}
```

- `shadowAngleDeg`: the direction shadows fall in image space (0 = right, 90 = down). `elevationDeg` sets the length (lower means longer).
- Shadow `type`:
  - `none`
  - `contact`: a soft ellipse at `floorY`, for props on a surface and seated characters.
  - `ground-drop`: the silhouette projected onto the floor line `floorY` along the light and foreshortened, for furniture.
  - `wall-cast`: the silhouette offset `distance` px along the light, for wall decor.
- `contact` (0..1) adds a soft contact/ambient-occlusion ellipse under the base on top of the main shadow (`planShadows` returns both).
- `scale`, `blur`, `opacity` multiply the light's values. `offset` is a final pixel nudge.

## API

```ts
import { planShadows, lightVector, parseLayersQuery, DEFAULT_LIGHT } from '../lib/shadows/shadows';
import { rasteriseShadow, multiplyShadow } from '../lib/shadows/render';

for (const plan of planShadows(layer, light, moveX, moveY)) { // pure math, unit-tested (tests/shadows.test.ts)
  const mask = rasteriseShadow(plan, casterCanvas, W, H); // canvas 2D: transform + blur
  multiplyShadow(rgbBuffer, mask, hexToRgb(light.color)); // apply just before drawing the caster
}
const [lx, ly, lz] = lightVector(light);                 // the same light drives normal-map shading
```

Draw order: for each visible layer in z order, multiply its shadow into what is already drawn, then draw the layer.
That way a shadow falls on lower layers (floor, rug, wall) and never on its own caster.

Deep links for checks and screenshots: `#/layers?off=fan,box&move=box:-300:0&shadows=0&angle=300`.
