import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let seq = 0;
function id() {
  const tail = seq.toString(16).padStart(12, '0');
  seq += 1;
  return `a4c0e001-0000-4000-8000-${tail}`;
}

function ent(kind, title, slug, extra = {}) {
  return { id: id(), kind, title, slug, ...extra };
}

const screens = [
  ['player-room', 'ห้องของฉัน', 'My room', 'real'],
  ['event-select', 'เลือกเหตุการณ์', 'Choose an event', 'demo'],
  ['cutscene', 'ฉากเปิดเรื่อง', 'Opening cutscene', 'demo'],
  ['difficulty', 'เลือกระดับความยาก', 'Choose difficulty', 'demo'],
  ['house-map', 'แผนผังบ้าน', 'House map', 'demo'],
  ['living-room', 'ห้องนั่งเล่น', 'Living room', 'demo'],
  ['study', 'ห้องทำงาน', 'Study', 'demo'],
  ['kitchen', 'ครัว', 'Kitchen', 'demo'],
  ['kitchen-close', 'ครัวมุมใกล้', 'Kitchen close-up', 'demo'],
  ['table', 'โต๊ะกลาง', 'Coffee table', 'demo'],
  ['tray', 'ถาดชิ้นแผนผัง', 'Map-piece tray', 'demo'],
  ['grandma', 'ยายมะลิ', 'Grandma Mali', 'demo'],
  ['uncle', 'ลุงเมฆ', 'Uncle Mek', 'demo'],
  ['star-box', 'กล่องรูปดาว', 'Star box', 'demo'],
  ['crossword', 'ครอสเวิร์ด', 'Crossword', 'demo'],
  ['jigsaw', 'จิ๊กซอว์', 'Jigsaw', 'demo'],
  ['slide', 'เลื่อนบล็อก', 'Sliding block', 'demo'],
  ['notebook', 'สมุดคดี', 'Case notebook', 'demo'],
  ['case-board', 'กระดานสรุปคดี', 'Case board', 'demo'],
  ['album', 'พบอัลบั้ม', 'Album found', 'demo'],
  ['return-home', 'กลับบ้านพร้อมของรางวัล', 'Return home with the reward', 'real'],
  ['practice', 'มุมฝึกเล่น', 'Practice corner', 'demo'],
  ['level-map', 'แผนที่ด่าน', 'Level map', 'demo'],
];

const registry = ent('screen-registry', 'ทะเบียนหน้าจอ', 'screen-registry', {
  titleEn: 'Screen registry',
  screens: screens.map(([screen, title, titleEn, status]) =>
    ent('screen', title, `screen/${screen}`, { titleEn, screen, status }),
  ),
});

function spot(title, slug, x, y, action, extra = {}) {
  return ent('hotspot', title, slug, {
    titleEn: extra.en,
    x,
    y,
    when: extra.when ?? 'always',
    action,
    doneEvidence: extra.done ?? null,
  });
}

const go = (screen) => ({ type: 'go', screen });
const toast = (text) => ({ type: 'toast', text });

const scenes = [
  ent('scene', 'แผนผังบ้านย่า', 'flow/scene/house-map', {
    titleEn: 'House map',
    screen: 'house-map',
    image: 'house-map.jpg',
    contain: true,
    hud: 'เลือกห้องที่จะไป',
    spots: [
      spot('ห้องนั่งเล่น (จุดเริ่ม)', 'flow/house-map/living', 50.2, 27.5, go('living-room'), { en: 'Living room' }),
      spot('ห้องทำงาน', 'flow/house-map/study', 34.9, 62.3, go('study'), { en: 'Study' }),
      spot('ครัว (เสริม)', 'flow/house-map/kitchen', 72.5, 62.3, go('kitchen'), { en: 'Kitchen' }),
    ],
  }),
  ent('scene', 'ห้องนั่งเล่น', 'flow/scene/living-room', {
    titleEn: 'Living room',
    screen: 'living-room',
    image: 'living-wide.jpg',
    images: {
      now: 'living-wide.jpg',
      afternoon: 'living-wide-afternoon.jpg',
      yesterday: 'living-wide-yesterday.jpg',
    },
    map: true,
    timed: true,
    hud: 'ภารกิจ: ตามหาอัลบั้มครอบครัว',
    spots: [
      spot('นาฬิกา', 'flow/living-room/clock', 13, 12.5, { type: 'clock' }, { en: 'Clock' }),
      spot('ปฏิทินของยาย', 'flow/living-room/calendar', 80, 27, { type: 'calendar' }, { en: 'Grandma calendar' }),
      spot('ถาดชิ้นแผนผัง', 'flow/living-room/tray', 41, 37, go('tray'), { en: 'Map tray', when: 'now', done: 'E04' }),
      spot('ประตูไปครัว', 'flow/living-room/kitchen-door', 12, 25.3, go('kitchen'), { en: 'Door to the kitchen', when: 'now' }),
      spot('ประตูไปห้องทำงาน', 'flow/living-room/study-door', 92, 33.8, go('study'), { en: 'Door to the study', when: 'now' }),
      spot('กล่องรูปดาว (ข้างโซฟา)', 'flow/living-room/star-box', 85.3, 70.5, toast('สัญลักษณ์ตรงแล้ว แต่ตำแหน่งนี้ตรงกับผังเก็บภาพถ่ายหรือยัง?'), { en: 'Star box by the sofa', when: 'now' }),
      spot('โต๊ะกลาง', 'flow/living-room/table', 42, 71.1, go('table'), { en: 'Coffee table', when: 'now', done: 'E01' }),
      spot('ลุงเมฆ', 'flow/living-room/mek', 17.8, 49.6, go('uncle'), { en: 'Uncle Mek', when: 'now', done: 'E03' }),
      spot('ยายมะลิ', 'flow/living-room/grandma', 61.4, 50.1, go('grandma'), { en: 'Grandma Mali', when: 'now' }),
      spot('กล่องรูปดาว (ข้างโซฟา)', 'flow/living-room/star-box-past', 84.3, 70.5, toast('กล่องนี้อยู่ที่เดิมทุกช่วงเวลา'), { when: 'afternoon' }),
      spot('น้าริน (บ่ายนี้)', 'flow/living-room/rin', 27, 44.2, {
        type: 'lines',
        who: 'น้าริน',
        lines: ['แย่จัง แจกันล้ม น้ำหกเต็มโต๊ะเลย ต้องรีบเช็ดก่อน', 'ของบนโต๊ะต้องยกออกไปก่อน เดี๋ยวเปียกหมด'],
      }, { en: 'Aunt Rin this afternoon', when: 'afternoon' }),
      spot('แจกันล้ม', 'flow/living-room/fallen-vase', 38.5, 68, {
        type: 'lines',
        who: 'ย้อนเวลา: บ่ายนี้',
        lines: ['แจกันล้ม น้ำหกนองโต๊ะ — อัลบั้มวางอยู่ข้าง ๆ เกือบเปียก!'],
      }, { when: 'afternoon' }),
      spot('อัลบั้ม (บ่ายนี้)', 'flow/living-room/album-then', 58, 69.5, {
        type: 'lines',
        who: 'ย้อนเวลา: บ่ายนี้',
        lines: ['บ่ายนี้อัลบั้มยังอยู่บนโต๊ะ แต่ตอนนี้หายไป ใครยกไปตอนเช็ดน้ำนะ?'],
      }, { when: 'afternoon' }),
      spot('ถาดชิ้นแผนผัง', 'flow/living-room/tray-afternoon', 47, 37, toast('ชิ้นแผนผังยังอยู่ในถาด'), { when: 'afternoon' }),
      spot('กล่องรูปดาว (ข้างโซฟา)', 'flow/living-room/star-box-yesterday', 84.3, 70.5, toast('กล่องนี้อยู่ที่เดิมทุกช่วงเวลา'), { when: 'yesterday' }),
      spot('ยายมะลิ (เมื่อวาน)', 'flow/living-room/grandma-yesterday', 26.7, 39, {
        type: 'lines',
        who: 'ยายมะลิ',
        lines: ['พรุ่งนี้หลานจะมา ยายจะหยิบอัลบั้มเล่มนี้ลงไปเปิดให้ดูตอนเช้า', 'รูปเก่า ๆ บ้านเรามีที่เก็บประจำนะ แต่เล่มนี้ยายชอบไว้ใกล้ตัว'],
      }, { when: 'yesterday' }),
      spot('อัลบั้มบนชั้น', 'flow/living-room/album-shelf', 43, 30, {
        type: 'lines',
        who: 'ย้อนเวลา: เมื่อวาน',
        lines: ['อัลบั้มปกดอกไม้ตั้งอยู่บนชั้นบน ใกล้มือยาย'],
      }, { when: 'yesterday' }),
      spot('ถาดชิ้นแผนผัง', 'flow/living-room/tray-yesterday', 42.5, 37.5, toast('ชิ้นแผนผังยังเรียงอยู่ในถาดครบ'), { when: 'yesterday' }),
    ],
  }),
  ent('scene', 'ห้องทำงาน', 'flow/scene/study', {
    titleEn: 'Study',
    screen: 'study',
    image: 'study-wide.jpg',
    map: true,
    hud: 'ภารกิจ: หากล่องที่ถูกต้อง',
    spots: [
      spot('กล่องรูปใบไม้', 'flow/study/leaf-box', 66.5, 64, toast('อยู่ในโซนที่หาแล้ว ลองเทียบสัญลักษณ์กับสิ่งที่ลุงเมฆเห็นอีกครั้ง'), { en: 'Leaf box' }),
      spot('กล่องรูปดาว (ใต้หน้าต่าง)', 'flow/study/star-box', 50.8, 63, go('star-box'), { en: 'Star box under the window' }),
    ],
  }),
  ent('scene', 'ครัว', 'flow/scene/kitchen', {
    titleEn: 'Kitchen',
    screen: 'kitchen',
    image: 'kitchen-wide.jpg',
    map: true,
    hud: 'ไม่บังคับ',
    spots: [
      spot('ผ้าเปียกบนราว', 'flow/kitchen/cloth', 31.5, 40.5, go('kitchen-close'), { en: 'Wet cloth' }),
      spot('แจกันเติมน้ำใหม่', 'flow/kitchen/vase', 79.5, 50, go('kitchen-close'), { en: 'Refilled vase' }),
    ],
  }),
  ent('scene', 'ครัวมุมใกล้', 'flow/scene/kitchen-close', {
    titleEn: 'Kitchen close-up',
    screen: 'kitchen-close',
    image: 'kitchen-close.jpg',
    map: true,
    hud: 'ร่องรอยน้ำหก',
    spots: [
      spot('ผ้าเปียก', 'flow/kitchen-close/cloth', 28.6, 40, { type: 'evidence', evidence: 'E02', who: 'ผ้าเปียก', text: 'ผ้าที่ใช้เช็ดโต๊ะยังเปียก' }, { en: 'Wet cloth' }),
      spot('แจกันเติมน้ำใหม่', 'flow/kitchen-close/vase', 68.7, 59.5, toast('แจกันถูกเติมน้ำใหม่ — มีน้ำหกจริง'), { en: 'Refilled vase' }),
    ],
  }),
  ent('scene', 'โต๊ะกลาง', 'flow/scene/table', {
    titleEn: 'Coffee table',
    screen: 'table',
    image: 'living-table.jpg',
    map: true,
    hud: 'แตะเพื่อตรวจ',
    spots: [
      spot('ข้อความของน้าริน', 'flow/table/note', 35, 31.3, {
        type: 'evidence',
        evidence: 'E01',
        who: 'ข้อความ',
        text: 'ขอย้ายเก็บก่อน — ริน / (ด้านหลัง) เก็บตามผังเดิมนะ โต๊ะยังเปียกอยู่',
      }, { en: "Aunt Rin's note", done: 'E01' }),
      spot('รอยน้ำ', 'flow/table/water', 39.8, 53.3, { type: 'evidence', evidence: 'E02', who: 'รอยน้ำ', text: 'โต๊ะเปียก — น้ำหกจากแจกัน' }, { en: 'Water mark', done: 'E02' }),
      spot('รอยที่อัลบั้มเคยวาง', 'flow/table/album-mark', 70, 64.3, toast('ตรงนี้เคยมีอัลบั้มวางอยู่'), { en: 'Where the album sat' }),
    ],
  }),
  ent('scene', 'ถาดชิ้นแผนผัง', 'flow/scene/tray', {
    titleEn: 'Map-piece tray',
    screen: 'tray',
    image: 'living-shelf-tray.jpg',
    map: true,
    hud: 'ชิ้นแผนผังแม่เหล็กหล่นกระจาย',
    spots: [
      spot('ต่อจิ๊กซอว์แผนผังบ้าน', 'flow/tray/jigsaw', 58.7, 65.5, { type: 'minigame', screen: 'jigsaw' }, { en: 'House-map jigsaw', done: 'E04' }),
    ],
  }),
  ent('scene', 'ยายมะลิ', 'flow/scene/grandma', {
    titleEn: 'Grandma Mali',
    screen: 'grandma',
    image: 'living-grandma.jpg',
    map: true,
    hud: 'คุยกับยายมะลิ',
    enter: 'flow/dialogue/grandma-open',
    enterWhenSolved: 'flow/dialogue/grandma-win',
    spots: [spot('คุยกับยาย', 'flow/grandma/talk', 50, 42, { type: 'dialogue', dialogue: 'flow/dialogue/grandma-open' }, { en: 'Talk' })],
  }),
  ent('scene', 'ลุงเมฆ', 'flow/scene/uncle', {
    titleEn: 'Uncle Mek',
    screen: 'uncle',
    image: 'uncle-mek.jpg',
    map: true,
    hud: 'คุยกับลุงเมฆ',
    enter: 'flow/dialogue/mek-open',
    spots: [spot('คุยกับลุงเมฆ', 'flow/uncle/talk', 50, 40, { type: 'dialogue', dialogue: 'flow/dialogue/mek-open' }, { en: 'Talk' })],
  }),
  ent('scene', 'กล่องรูปดาว', 'flow/scene/star-box', {
    titleEn: 'Star box',
    screen: 'star-box',
    image: 'study-box.jpg',
    map: true,
    hud: 'กล่องสีน้ำเงินติดรูปดาว · ตัวล็อกเลื่อนบล็อกบนฝา',
    spots: [
      spot('สติกเกอร์รูปดาว', 'flow/star-box/sticker', 46.5, 70, toast('กล่องสีน้ำเงินติดรูปดาว'), { en: 'Star sticker' }),
      spot('ตัวล็อก', 'flow/star-box/lock', 52.6, 44.8, { type: 'box-lock' }, { en: 'Lock' }),
    ],
  }),
  ent('scene', 'พบอัลบั้มแล้ว', 'flow/scene/album', {
    titleEn: 'Album found',
    screen: 'album',
    image: 'album-found.jpg',
    hud: 'หลักฐาน E05',
    enter: 'flow/dialogue/album-open',
    spots: [
      spot('รูปตาตอนหนุ่ม', 'flow/album/portrait', 37.8, 44.5, { type: 'dialogue', dialogue: 'flow/dialogue/album-portrait' }, { en: "Grandfather's photo" }),
      spot('โปสการ์ด', 'flow/album/postcard', 80, 45, { type: 'dialogue', dialogue: 'flow/dialogue/album-card' }, { en: 'Postcard' }),
    ],
  }),
];

const choice = (title, slug, extra) => ent('choice', title, slug, extra);

const dialogues = [
  ent('dialogue', 'ยายเปิดเรื่อง', 'flow/dialogue/grandma-open', {
    who: 'ยายมะลิ',
    text: 'หลานมาแล้วเหรอจ๊ะ ยายหาอัลบั้มรูปครอบครัวไม่เจอ ในนั้นมีรูปตาตอนหนุ่ม ๆ ด้วยนะ',
    choices: [
      choice('ถามเรื่องอัลบั้ม', 'flow/dialogue/grandma-open/ask', { next: 'flow/dialogue/grandma-ask' }),
      choice('ปิด', 'flow/dialogue/grandma-open/close', { action: { type: 'toast', text: '' } }),
    ],
  }),
  ent('dialogue', 'ยายเล่าเรื่องอัลบั้ม', 'flow/dialogue/grandma-ask', {
    who: 'ยายมะลิ',
    text: 'เมื่อเช้ายายยังเห็นวางอยู่บนโต๊ะกลางเลย แต่บ่ายนี้น้ารินเข้ามาเก็บกวาดนะ',
    choices: [choice('ปิด', 'flow/dialogue/grandma-ask/close', {})],
  }),
  ent('dialogue', 'ยายดีใจ', 'flow/dialogue/grandma-win', {
    who: 'ยายมะลิ',
    text: 'นี่ไงรูปตา ขอบใจนะหลาน มานั่งดูด้วยกันมา ยายจะเล่าให้ฟัง',
    choices: [choice('ปิด', 'flow/dialogue/grandma-win/close', {})],
  }),
  ent('dialogue', 'ลุงเมฆเล่า', 'flow/dialogue/mek-open', {
    who: 'ลุงเมฆ',
    text: 'รินเอาอัลบั้มใส่กล่องที่ติดรูปดาว ลุงเห็นตอนเธอยกผ่านโต๊ะ แต่ไม่ได้มองว่าเอาไปวางที่ไหน',
    choices: [
      choice('ช่วยเติมครอสเวิร์ด (เสริม)', 'flow/dialogue/mek-open/help', { next: 'flow/dialogue/mek-crossword' }),
      choice('ปิด', 'flow/dialogue/mek-open/close', {}),
    ],
  }),
  ent('dialogue', 'ลุงชวนเล่นครอสเวิร์ด', 'flow/dialogue/mek-crossword', {
    who: 'ลุงเมฆ',
    text: 'ถ้าชอบเกมคำศัพท์ มาช่วยลุงเติมหน้านี้ด้วยก็ได้นะ อีกไม่กี่คำเอง',
    choices: [
      choice('เปิดครอสเวิร์ด', 'flow/dialogue/mek-crossword/play', { action: { type: 'minigame', screen: 'crossword' } }),
      choice('ปิด', 'flow/dialogue/mek-crossword/close', {}),
    ],
  }),
  ent('dialogue', 'ลุงขอบคุณ', 'flow/dialogue/mek-thanks', {
    who: 'ลุงเมฆ',
    text: 'ครบแล้ว! เดี๋ยวให้ทุกคนลองเล่นกัน ขอบใจมากนะ',
    choices: [choice('ปิด', 'flow/dialogue/mek-thanks/close', {})],
  }),
  ent('dialogue', 'เปิดอัลบั้ม', 'flow/dialogue/album-open', {
    who: 'ยายมะลิ',
    text: 'เจอแล้ว! หน้าปกดอกไม้เล่มนี้เอง',
    choices: [choice('ปิด', 'flow/dialogue/album-open/close', {})],
  }),
  ent('dialogue', 'รูปตา', 'flow/dialogue/album-portrait', {
    who: 'ยายมะลิ',
    text: 'นี่ไงรูปตา ขอบใจนะหลาน มานั่งดูด้วยกันมา ยายจะเล่าให้ฟัง',
    choices: [choice('ต่อ', 'flow/dialogue/album-portrait/next', { next: 'flow/dialogue/album-rin' })],
  }),
  ent('dialogue', 'รินอธิบาย', 'flow/dialogue/album-rin', {
    who: 'ริน',
    text: 'หาเจอแล้วใช่ไหม? เมื่อกี้น้ำหกบนโต๊ะ ฉันเลยรีบยกอัลบั้มใส่กล่อง แล้วทิ้งข้อความไว้',
    choices: [choice('ปิด', 'flow/dialogue/album-rin/close', {})],
  }),
  ent('dialogue', 'โปสการ์ด', 'flow/dialogue/album-card', {
    who: 'โปสการ์ด',
    text: 'ภาพที่เหลือฝากไว้ที่ห้องสมุดวันวาน — ลิ้นชักหมายเลข 7',
    choices: [choice('เก็บโปสการ์ด แล้วกลับบ้าน', 'flow/dialogue/album-card/home', { action: { type: 'home' } })],
  }),
  ent('dialogue', 'สรุปคดีผ่าน', 'flow/dialogue/deduce-ok', {
    who: 'ยายมะลิ',
    text: 'เก่งมากหลาน! งั้นไปดูที่ห้องทำงานกันเถอะ',
    choices: [choice('ไปห้องทำงาน', 'flow/dialogue/deduce-ok/go', { action: go('study') })],
  }),
  ent('dialogue', 'แผนผังบอกที่เก็บ', 'flow/dialogue/map-clue', {
    who: 'แผนผัง',
    text: 'หมวด “ภาพถ่ายและจดหมาย” อยู่ใต้หน้าต่างห้องทำงาน ส่วนข้างโซฟาในห้องนั่งเล่นเป็นของเล่น',
    choices: [choice('ปิด', 'flow/dialogue/map-clue/close', {})],
  }),
];

const emptyClose = new Set([
  'flow/dialogue/grandma-open/close',
  'flow/dialogue/grandma-ask/close',
  'flow/dialogue/grandma-win/close',
  'flow/dialogue/mek-open/close',
  'flow/dialogue/mek-crossword/close',
  'flow/dialogue/mek-thanks/close',
  'flow/dialogue/album-open/close',
  'flow/dialogue/album-rin/close',
  'flow/dialogue/map-clue/close',
]);
for (const dialogue of dialogues) {
  for (const item of dialogue.choices) {
    if (emptyClose.has(item.slug)) delete item.action;
  }
}

const flow = ent('story-flow', 'คดี 01 อัลบั้มครอบครัวที่หายไป', 'flow/case-01', {
  titleEn: 'Case 01',
  difficulties: ['ง่าย', 'ปานกลาง', 'ยาก'],
  events: [
    ent('event', 'เยี่ยมบ้านคุณยาย', 'flow/event/case-01', {
      titleEn: 'Visit grandma',
      eventId: 'case-01',
      subtitle: 'อัลบั้มครอบครัวหายไป',
      cover: 'cutscene-01-p2.jpg',
      unlockAfter: null,
      lockedHint: null,
    }),
    ent('event', 'ห้องสมุดวันวาน', 'flow/event/case-02', {
      titleEn: 'Library of yesterday',
      eventId: 'case-02',
      subtitle: 'ลิ้นชักหมายเลข 7',
      cover: 'study-wide.jpg',
      unlockAfter: 'case-01',
      lockedHint: 'ปลดล็อกเมื่อจบคดี 01',
    }),
    ent('event', 'ตลาดน้ำยามเช้า', 'flow/event/case-03', {
      titleEn: 'Morning market',
      eventId: 'case-03',
      subtitle: 'เร็ว ๆ นี้',
      cover: 'kitchen-wide.jpg',
      unlockAfter: 'case-02',
      lockedHint: 'ปลดล็อกเมื่อจบคดี 02',
    }),
  ],
  pages: [
    ent('cutscene-page', 'ยายโทรมา', 'flow/cutscene/case-01/p1', {
      eventId: 'case-01',
      image: 'cutscene-01-p1.jpg',
      caption: 'คืนวันศุกร์ คุณยายมะลิโทรมาหาแม่',
      lines: [
        ent('speech-line', 'แม่', 'flow/cutscene/case-01/p1/mom', {
          who: 'แม่',
          text: 'พรุ่งนี้เราไปเยี่ยมบ้านคุณยายกันนะ',
          x: 4,
          y: 22,
          w: 48,
        }),
        ent('speech-line', 'หนู', 'flow/cutscene/case-01/p1/child', {
          who: 'หนู',
          text: 'เย้! ไปหาคุณยาย!',
          x: 40,
          y: 58,
          w: 44,
        }),
      ],
    }),
    ent('cutscene-page', 'ถึงบ้านไม้', 'flow/cutscene/case-01/p2', {
      eventId: 'case-01',
      image: 'cutscene-01-p2.jpg',
      caption: 'เช้าวันเสาร์ ครอบครัวมาถึงบ้านไม้ของคุณยาย',
      lines: [
        ent('speech-line', 'ยายมะลิ', 'flow/cutscene/case-01/p2/grandma', {
          who: 'ยายมะลิ',
          text: 'มาแล้วเหรอจ๊ะหลาน ยายคิดถึงจังเลย',
          x: 2,
          y: 46,
          w: 50,
        }),
      ],
    }),
    ent('cutscene-page', 'อัลบั้มหาย', 'flow/cutscene/case-01/p3', {
      eventId: 'case-01',
      image: 'cutscene-01-p3.jpg',
      caption: 'แต่คุณยายดูไม่สบายใจเลย…',
      lines: [
        ent('speech-line', 'ยายมะลิ', 'flow/cutscene/case-01/p3/grandma', {
          who: 'ยายมะลิ',
          text: 'อัลบั้มรูปครอบครัวหายไปจากชั้นจ้ะ ในนั้นมีรูปตาตอนหนุ่ม ๆ ด้วย',
          x: 2,
          y: 50,
          w: 34,
        }),
        ent('speech-line', 'หนู', 'flow/cutscene/case-01/p3/child', {
          who: 'หนู',
          text: 'ไม่ต้องห่วงนะยาย หนูจะช่วยตามหาเอง!',
          x: 56,
          y: 72,
          w: 42,
        }),
      ],
    }),
  ],
  evidence: [
    ent('evidence', 'ข้อความของน้าริน', 'flow/evidence/e01', {
      code: 'E01',
      text: 'ข้อความของน้าริน: "ขอย้ายเก็บก่อน — ริน / เก็บตามผังเดิมนะ โต๊ะยังเปียกอยู่"',
    }),
    ent('evidence', 'โต๊ะที่เปียก', 'flow/evidence/e02', {
      code: 'E02',
      text: 'โต๊ะที่เปียก (น้ำจากแจกันหก)',
    }),
    ent('evidence', 'กล่องมีรูปดาว', 'flow/evidence/e03', {
      code: 'E03',
      text: 'ลุงเมฆ: กล่องมีรูปดาว',
    }),
    ent('evidence', 'แผนผังที่เก็บภาพ', 'flow/evidence/e04', {
      code: 'E04',
      text: 'แผนผังบ้าน: ภาพถ่ายเก็บใต้หน้าต่างห้องทำงาน',
    }),
    ent('evidence', 'พบอัลบั้ม', 'flow/evidence/e05', {
      code: 'E05',
      text: 'พบอัลบั้มในกล่องรูปดาว',
    }),
  ],
  slots: [
    ent('time-slot', 'เมื่อวานเย็น (21 ต.ค.)', 'flow/time/yesterday', {
      slot: 'yesterday',
      part: 'day',
      image: 'living-wide-yesterday.jpg',
      unlockBy: 'E01',
      hint: 'ลองหาข้อความบนโต๊ะกลางก่อน',
    }),
    ent('time-slot', 'บ่ายนี้ 14:00', 'flow/time/afternoon', {
      slot: 'afternoon',
      part: 'hour',
      image: 'living-wide-afternoon.jpg',
      unlockBy: 'E02',
      hint: 'ลองตรวจรอยน้ำบนโต๊ะก่อน',
    }),
    ent('time-slot', 'ตอนนี้ 17:00', 'flow/time/now', {
      slot: 'now',
      part: 'hour',
      image: 'living-wide.jpg',
      unlockBy: null,
      hint: null,
    }),
  ],
  scenes,
  dialogues,
  games: [
    ent('minigame', 'ครอสเวิร์ดของลุงเมฆ', 'flow/minigame/crossword', {
      titleEn: 'Crossword',
      game: 'crossword',
      hud: 'มินิเกม: ครอสเวิร์ด',
    }),
    ent('minigame', 'จิ๊กซอว์แผนผังบ้าน', 'flow/minigame/jigsaw', {
      titleEn: 'Jigsaw',
      game: 'jigsaw',
      hud: 'มินิเกม: จิ๊กซอว์ (ชิ้นไม่ต้องหมุน)',
    }),
    ent('minigame', 'ตัวล็อกเลื่อนบล็อก', 'flow/minigame/slide', {
      titleEn: 'Sliding block',
      game: 'slide',
      hud: 'มินิเกม: พากุญแจ K ไปทางออกด้านขวา',
    }),
  ],
  practice: [
    ['cross', 'ครอสเวิร์ด', '📰', 'คำ', '01', false],
    ['jig', 'จิ๊กซอว์แผนผัง', '🗺', 'ภาพ', '01', false],
    ['slide', 'เลื่อนบล็อก', '🧩', 'ตรรกะ', '01', false],
    ['ex', 'จับผิดภาพ', '🔍', 'ภาพ', '02', true],
    ['ex', 'จับคู่ความจำ', '🃏', 'ภาพ', '03', true],
    ['ex', 'ถอดรหัส', '🔐', 'คำ', '02', true],
    ['ex', 'เขาวงกต', '🌀', 'ตรรกะ', '04', true],
    ['ex', 'ต่อท่อ', '🚰', 'ตรรกะ', '05', true],
    ['ex', 'เรียงลำดับเหตุการณ์', '🗓', 'คำ', '03', true],
  ].map(([game, title, icon, group, caseNo, future], index) =>
    ent('practice-game', title, `flow/practice/${future ? 'future' : game}-${index}`, {
      game,
      icon,
      group,
      caseNo,
      future,
    }),
  ),
  questions: [
    ent('question', 'ใครย้ายอัลบั้ม', 'flow/question/who', {
      prompt: '1. ใครย้ายอัลบั้ม?',
      right: 'rin',
      evidence: ['E01', 'E03'],
      hint: 'ลองอ่านกระดาษบนโต๊ะอีกทีสิจ๊ะ ใครเป็นคนเขียนไว้นะ',
      mode: 'portrait',
      answers: [
        choice('ยายมะลิ', 'flow/question/who/grandma', { value: 'grandma', image: 'living-grandma.jpg' }),
        choice('ลุงเมฆ', 'flow/question/who/mek', { value: 'mek', image: 'uncle-mek.jpg' }),
        choice('น้าริน', 'flow/question/who/rin', { value: 'rin', image: 'rin.jpg' }),
      ],
    }),
    ent('question', 'ย้ายทำไม', 'flow/question/why', {
      prompt: '2. ย้ายทำไม?',
      right: 'water',
      evidence: ['E02'],
      hint: 'โต๊ะยังเปียกอยู่เลยนะ หลานว่าเกิดอะไรขึ้น',
      mode: 'chips',
      answers: [
        choice('น้ำหกบนโต๊ะ', 'flow/question/why/water', { value: 'water' }),
        choice('แอบซ่อนไว้', 'flow/question/why/hide', { value: 'hide' }),
        choice('หยิบไปดูรูป', 'flow/question/why/look', { value: 'look' }),
      ],
    }),
    ent('question', 'เก็บไว้ที่ไหน', 'flow/question/where', {
      prompt: '3. เก็บไว้ที่ไหน? (แตะบนแผนผัง)',
      right: 'study',
      evidence: ['E04'],
      hint: 'รูปเก่า ๆ บ้านนี้เขาเก็บไว้ที่เดียวกันมาตลอดแหละ ลองต่อแผนที่ที่หล่นกระจายอยู่ดูสิ',
      mode: 'map',
      answers: [
        choice('ห้องนั่งเล่น', 'flow/question/where/living', { value: 'living' }),
        choice('ห้องทำงาน (ใต้หน้าต่าง)', 'flow/question/where/study', { value: 'study' }),
        choice('ครัว', 'flow/question/where/kitchen', { value: 'kitchen' }),
      ],
    }),
  ],
  goals: [
    ent('goal', 'ตรวจโต๊ะกลาง', 'flow/goal/table', { code: 'table', room: 'ห้องนั่งเล่น', at: 'living-room', object: 'โต๊ะกลาง' }),
    ent('goal', 'ต่อแผนผัง', 'flow/goal/tray', { code: 'tray', room: 'ห้องนั่งเล่น', at: 'living-room', object: 'ถาดชิ้นแผนผัง' }),
    ent('goal', 'คุยกับลุงเมฆ', 'flow/goal/mek', { code: 'mek', room: 'ห้องนั่งเล่น', at: 'living-room', object: 'ลุงเมฆ' }),
    ent('goal', 'สรุปคดี', 'flow/goal/deduce', { code: 'deduce', room: 'สมุดคดี', at: null, object: 'ปุ่มสมุดคดี' }),
    ent('goal', 'เปิดกล่องรูปดาว', 'flow/goal/box', { code: 'box', room: 'ห้องทำงาน', at: 'study', object: 'กล่องรูปดาว' }),
    ent('goal', 'กลับบ้าน', 'flow/goal/home', { code: 'home', room: 'บ้านของฉัน', at: 'player-room', object: 'ช่องวางของ' }),
  ],
});

const root = dirname(fileURLToPath(import.meta.url));
const data = join(root, '../public/data');
writeFileSync(join(data, 'screens.json'), JSON.stringify(registry, null, 2) + '\n');
writeFileSync(join(data, 'case-flow.json'), JSON.stringify(flow, null, 2) + '\n');
console.log('screens', registry.screens.length, 'ids', seq);
