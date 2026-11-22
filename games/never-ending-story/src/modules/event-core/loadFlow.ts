import { validateEntities } from '../../lib/catalog';
import { imageUrl } from '../../lib/imageUrl';
import type { CaseFlow, ScreenRegistry } from './types';

/** Bump when case-flow / screens JSON changes so clients skip a stale cache of the stable URL. */
export const FLOW_DATA_REV = '0.6.35';

export async function loadFlow(): Promise<{ flow: CaseFlow; screens: ScreenRegistry }> {
  const base = import.meta.env.BASE_URL;
  const q = `?v=${FLOW_DATA_REV}`;
  const fetchJson = (path: string) => fetch(`${base}${path}${q}`, { cache: 'no-store' });
  const [screenRes, flowRes] = await Promise.all([
    fetchJson('data/screens.json'),
    fetchJson('data/case-flow.json'),
  ]);
  if (!screenRes.ok || !flowRes.ok) throw new Error('โหลดหน้าจอไม่ได้');
  const screens: unknown = await screenRes.json();
  const flow: unknown = await flowRes.json();
  validateEntities(screens, 'screen-registry');
  validateEntities(flow, 'story-flow');
  return { screens: screens as ScreenRegistry, flow: flow as CaseFlow };
}

export { imageUrl };
