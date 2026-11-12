/** Event 01 "Visit Grandma's house" (case-01). Story data lives in public/data/case-flow.json (eventId case-01). */
import { endingIdFor } from '../event-core';
import { filesForUse } from '../cutscene';
import './houseMap';

export const EVENT_ID = 'case-01';
/** Ending cutscene id. event-core joins pages whose eventId is `endingIdFor(EVENT_ID)`. */
export const ENDING_ID = endingIdFor(EVENT_ID);
/** Same filenames as before, listed by the cutscene module in `order`. */
export const EVENT_IMAGES = filesForUse('event-01');
