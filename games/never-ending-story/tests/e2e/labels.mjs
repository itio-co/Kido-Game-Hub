// Shared helpers for the Playwright checks in this folder. Labels come from the shipped data, so no player-facing text lives in test code.
import { readFileSync } from 'node:fs';

const read = (path) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
const flow = read('public/data/case-flow.json');
const room = read('public/data/player-room.json');

/** Labels for one language: spot(slug) is a hotspot's aria-label, slot(name) a time-slot button text, door the 3D room door. */
export function labels(lang) {
  const key = lang === 'en' ? 'titleEn' : 'title';
  const spots = new Map(flow.scenes.flatMap((scene) => scene.spots.map((spot) => [spot.slug, spot[key]])));
  const findDoor = (node) => {
    if (!node || typeof node !== 'object') return null;
    if (node.slug === 'player-room/door') return node[key];
    for (const value of Object.values(node)) { const hit = findDoor(value); if (hit) return hit; }
    return null;
  };
  return {
    spot: (slug) => { const label = spots.get(slug); if (!label) throw new Error(`no spot ${slug}`); return label; },
    slot: (name) => flow.slots.find((item) => item.slot === name)[key],
    door: findDoor(room),
  };
}

/** Save that skips onboarding and unlocks both past time slots (E01: yesterday, E02: afternoon). */
export const SEED = JSON.stringify({ version: 1, player: { onboardingComplete: true }, knowledge: {}, caseState: {}, flow: { evidence: ['E01', 'E02'] } });

export const LAUNCH = { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };

/** Open a URL; click through the githack "Open the page" interstitial when a preview shows one. */
export async function open(page, url) {
  await page.goto(url);
  const gate = page.getByText('Open the page');
  if (await gate.count().catch(() => 0)) { await gate.first().click(); await page.waitForLoadState('load'); }
}
