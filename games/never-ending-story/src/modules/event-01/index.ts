/** Event 01 "Visit Grandma's house" (case-01). Story data lives in public/data/case-flow.json (eventId case-01). */
import { endingIdFor } from '../event-core';

export const EVENT_ID = 'case-01';
/** Ending cutscene id. event-core joins pages whose eventId is `endingIdFor(EVENT_ID)`. */
export const ENDING_ID = endingIdFor(EVENT_ID);
export const EVENT_IMAGES = ['cutscene-01-p1.jpg', 'cutscene-01-p2.jpg', 'cutscene-01-p3.jpg', 'living-wide.jpg', 'study-wide.jpg', 'kitchen-wide.jpg', 'house-map.jpg'];
