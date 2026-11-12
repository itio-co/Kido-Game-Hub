import { SHOWCASE_ASSETS, type ShowcaseAsset } from './showcaseAssets';
import flow from '../../public/data/case-flow.json';
import nightstand from '../../assets-src/nightstand/asset.json';
import clock from '../../assets-src/clock/asset.json';

export type AssetKind = 'model' | 'scene' | 'story' | 'character' | 'reference';
export type AssetFilter = AssetKind | 'all';
export type AssetRecord = {
  key: string; title: string; titleEn: string; kind: AssetKind; slug: string;
  image: string; imageMode?: 'turntable' | 'render'; source: string; description: string;
  model?: ShowcaseAsset; metadata?: typeof nightstand | typeof clock;
};
const BASE = import.meta.env.BASE_URL;
const manifests = [nightstand, clock];
export const ASSET_KINDS: { id: AssetFilter; label: string; short: string }[] = [
  { id: 'all', label: 'All assets', short: 'All assets' },
  { id: 'model', label: '3D models', short: '3D model' },
  { id: 'scene', label: 'Scenes & maps', short: 'Scene' },
  { id: 'story', label: 'Story artwork', short: 'Story art' },
  { id: 'character', label: 'Characters', short: 'Character' },
  { id: 'reference', label: 'References', short: 'Reference' },
];
export const kindLabel = (kind: AssetFilter) => ASSET_KINDS.find((item) => item.id === kind)?.short ?? kind;
export const editorHref = (asset: ShowcaseAsset, variant = 'lowpoly') =>
  `#/editor?asset=${encodeURIComponent(asset.slug)}&model=${encodeURIComponent(variant)}`;

const models: AssetRecord[] = SHOWCASE_ASSETS.map((model) => {
  const metadata = manifests.find((item) => item.slug === model.slug);
  const clockModel = model.slug === clock.slug;
  return {
    key: model.slug, title: model.title, titleEn: metadata?.titleEn ?? model.title,
    kind: 'model', slug: model.slug, model, metadata,
    image: `${BASE}catalog/${clockModel ? 'clock-three-quarter.png' : 'nightstand-turntable.png'}`,
    imageMode: clockModel ? 'render' : 'turntable',
    source: `assets-src/${model.slug.split('/').pop()}/asset.json`,
    description: metadata?.statusNotes ?? 'Editable model from the project registry.',
  };
});

// Resolve names and IDs from authored story data, with no inferred 3D availability.
const byImage = new Map<string, { title: string; titleEn?: string; slug: string; kind: AssetKind }>();
for (const scene of flow.scenes) byImage.set(scene.image, { ...scene,
  kind: ['grandma', 'uncle'].includes(scene.screen) ? 'character' : scene.screen === 'album' ? 'story' : 'scene',
});
const pageTitles = ['Grandma calls', 'Arriving at grandma’s', 'The missing album'];
for (const [index, page] of flow.pages.entries()) byImage.set(page.image, { ...page, titleEn: pageTitles[index], kind: 'story' });
for (const slot of flow.slots) if (!byImage.has(slot.image)) byImage.set(slot.image, { ...slot, titleEn: `Living room · ${slot.slug.split('/').pop()}`, kind: 'scene' });
byImage.set('player-room-wide.jpg', { title: 'ห้องของฉัน', titleEn: 'Player room', slug: 'player-room', kind: 'scene' });
// rin.jpg is a real project file but has no authored scene record. Keep its filename as the title.
byImage.set('rin.jpg', { title: 'rin.jpg', titleEn: 'Rin', slug: 'img/rin.jpg', kind: 'character' });

const images: AssetRecord[] = Object.keys(import.meta.glob('/public/img/*.jpg'))
  .sort().map((path) => {
    const filename = path.split('/').pop()!;
    const record = byImage.get(filename);
    return {
      key: `img/${filename}`, title: record?.title ?? filename, titleEn: record?.titleEn ?? filename,
      kind: record?.kind ?? 'scene', slug: record?.slug ?? `img/${filename}`,
      image: `${BASE}img/${filename}`, source: `public/img/${filename}`,
      description: filename === 'player-room-wide.jpg'
        ? 'Original player-room artwork used as the visual reference for the 3D room.'
        : 'Existing 2D project artwork. An image asset, not an editable 3D model.',
    };
  });
const references: AssetRecord[] = models.flatMap(({ model, metadata }) => model?.ref ? [{
  key: `reference/${model.slug}`, title: `${model.title} · ภาพอ้างอิง`,
  titleEn: `${metadata?.titleEn ?? model.title} reference`, kind: 'reference' as const,
  slug: model.slug, image: model.ref.src,
  source: `public/showcase/${model.slug.split('/').pop()}-ref.png`,
  description: `Original ${model.ref.width} × ${model.ref.height} px crop from the project artwork. Used for camera matching; not a render.`,
  model,
}] : []);

export const ASSET_CATALOG: AssetRecord[] = [...models, ...images, ...references];

export { filterAssets } from './assetSearch';
