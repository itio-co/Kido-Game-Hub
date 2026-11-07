import { validateEntities } from '../../lib/catalog';
import { imageUrl } from '../../lib/imageUrl';
import type { CaseFlow, ScreenRegistry } from './types';

export async function loadFlow(): Promise<{ flow: CaseFlow; screens: ScreenRegistry }> {
  const base = import.meta.env.BASE_URL;
  const [screenRes, flowRes] = await Promise.all([
    fetch(`${base}data/screens.json`),
    fetch(`${base}data/case-flow.json`),
  ]);
  if (!screenRes.ok || !flowRes.ok) throw new Error('โหลดหน้าจอไม่ได้');
  const screens: unknown = await screenRes.json();
  const flow: unknown = await flowRes.json();
  validateEntities(screens, 'screen-registry');
  validateEntities(flow, 'story-flow');
  return { screens: screens as ScreenRegistry, flow: flow as CaseFlow };
}

export { imageUrl };
