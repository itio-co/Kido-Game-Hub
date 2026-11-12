import { registerHouseMapGate, type HouseMapFlow } from '../event-core/progress.ts';

/** Evidence the house-plan jigsaw grants. The button stays hidden until the save has this code. */
export const HOUSE_MAP_EVIDENCE = 'E04';

/** Case 01, including a cached story file that predates `unlocksHouseMap`. */
export function isCase01HouseMap(flow: HouseMapFlow): boolean {
  if (!flow) return false;
  if (flow.slug === 'flow/case-01') return true;
  return (flow.events ?? []).some((event) => event.eventId === 'case-01' && !event.unlockAfter);
}

registerHouseMapGate(HOUSE_MAP_EVIDENCE, isCase01HouseMap);
