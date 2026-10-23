/** Thai labels for part names from the Blender build scripts (Leg_LF, Stretcher_R, …). Unknown names pass through. */
const WORDS: Record<string, string> = {
  TopSlab: 'แผ่นท็อป',
  Leg: 'ขา',
  Apron: 'คานใต้ท็อป',
  Rail: 'รางลิ้นชัก',
  Drawer: 'ลิ้นชัก',
  Face: 'หน้า',
  Cavity: 'ช่องเงา',
  Knob: 'มือจับ',
  Stretcher: 'คานระหว่างขา',
  Top: 'บน',
  Bot: 'ล่าง',
  Box: 'กล่อง',
  Bottom: 'พื้น',
};
const SIDES: Record<string, string> = { L: 'ซ้าย', R: 'ขวา', F: 'หน้า', B: 'หลัง' };

export function partLabel(name: string): string {
  const copy = name.match(/_copy(\d+)$/);
  const core = copy ? name.slice(0, copy.index) : name;
  const words = core.split('_').map((word) => {
    if (WORDS[word]) return WORDS[word];
    if (/^[LRFB]{1,2}$/.test(word)) return [...word].map((c) => SIDES[c]).join('');
    return word;
  });
  return words.join(' ') + (copy ? ` (สำเนา ${copy[1]})` : '');
}
