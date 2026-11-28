/** Player display-name validation and a curated pool of common everyday nicknames. */

export const NICK_MIN = 2;
export const NICK_MAX = 20;
const NICK_RE = /^[\p{Script=Thai}A-Za-z0-9 _.-]+$/u;

/** Returns an i18n error key, or null when the nickname is valid. */
export function nicknameError(raw: string): string | null {
  const value = raw.trim().replace(/\s+/g, ' ');
  if ([...value].length < NICK_MIN) return 'prologue.name.errShort';
  if ([...value].length > NICK_MAX) return 'prologue.name.errLong';
  if (!NICK_RE.test(value)) return 'prologue.name.errChars';
  return null;
}

export function cleanNickname(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/** Common Thai ชื่อเล่น people actually use (not formal given names). */
export const TH_NICKNAMES: readonly string[] = [
  'ต้น', 'แบงค์', 'มายด์', 'ฝน', 'บอล', 'เมย์', 'มิ้นท์', 'เบล', 'กิ๊ฟ', 'เฟิร์น',
  'น้ำ', 'ฟ้า', 'ข้าว', 'แพท', 'โอ๊ต', 'บีม', 'แก้ม', 'เจน', 'ต้อม', 'นุช',
  'หนึ่ง', 'เจ', 'บอส', 'เกล', 'ปราง', 'แพรว', 'ตูน', 'ปอ', 'ปิง', 'มิว',
  'เนย', 'ฝ้าย', 'ติ๊ก', 'เพชร', 'โบ', 'บี', 'เอ็ม', 'เอ', 'ไนซ์', 'เค้ก',
  'ออย', 'อาร์ต', 'ปอนด์', 'พีช', 'แบม', 'แอน', 'ไหม', 'กัน', 'ต้า', 'โฟล์ค',
  'เติ้ล', 'กันต์', 'เบิร์ด', 'แชมป์', 'ก้อง', 'แอม', 'อ้อม', 'อุ้ม', 'ปุย', 'เมฆ',
  'ดาว', 'พลอย', 'ทราย', 'ภู', 'ไผ่', 'มุก', 'มาย', 'แนน', 'นุ่น', 'ยิ้ม',
  'ฝัน', 'หวาน', 'แอปเปิ้ล', 'เชอรี่', 'ลูกเกด', 'กอล์ฟ', 'เป้', 'ตั้ม', 'มาร์ค', 'ไมค์',
  'นิค', 'เบน', 'วิน', 'พล', 'เอิร์ธ', 'แอมป์', 'นิว', 'เจมส์', 'ดรีม', 'เก่ง',
  'ป้อม', 'บิ๊ก', 'แมว', 'ฟิล์ม', 'เพลง', 'เบส', 'เบนซ์', 'เกรซ', 'คิม', 'เอิร์น',
  'ปริม', 'ขวัญ', 'แพร', 'เดือน', 'พราว', 'อุ่น', 'เปรี้ยว', 'รุ่ง', 'เอย', 'อิง',
  'ส้ม', 'มะนาว', 'แตง', 'กล้วย', 'โก้', 'บุ๊ค', 'พีท', 'แดน', 'แมน', 'นีน่า',
  'แอนนา', 'ซาร่า', 'โม', 'มิน', 'เบลล่า', 'ลิสา', 'มายด์ดี้', 'ตังค์', 'มิลค์', 'เลนส์',
  'เฟรม', 'ไนท์', 'เดย์', 'ซัน', 'ทะเล', 'คลื่น', 'หิน', 'นิด', 'หน่อย', 'เล็ก',
  'ชาลี', 'ต้าร์', 'ไข่', 'ปุ๊', 'แกง', 'ไก่', 'โฟน', 'เบสท์', 'แพ็ค', 'ญา',
  'มิ้น', 'น้า', 'แอนนี่', 'มารี', 'ตีนา', 'แทค', 'ณัฐ', 'ปอร์ช', 'ฮง', 'อิงค์',
];

/** Common English first names and nicknames for the English UI. */
export const EN_NICKNAMES: readonly string[] = [
  'Alex', 'Sam', 'Jamie', 'Taylor', 'Jordan', 'Casey', 'Riley', 'Morgan', 'Avery', 'Quinn',
  'Chris', 'Pat', 'Joe', 'Mike', 'Nick', 'Ben', 'Tom', 'Max', 'Jack', 'Lily',
  'Emma', 'Mia', 'Ava', 'Zoe', 'Ella', 'Grace', 'Lucy', 'Amy', 'Kate', 'Sarah',
  'Anna', 'Rose', 'May', 'June', 'Tess', 'Nate', 'Luke', 'Ryan', 'Evan', 'Owen',
  'Liam', 'Noah', 'Ethan', 'Mason', 'Logan', 'Jake', 'Will', 'Dan', 'Matt', 'Josh',
  'Adam', 'Aaron', 'Eric', 'Sean', 'Kyle', 'Drew', 'Cole', 'Blake', 'Brooke', 'Claire',
  'Chloe', 'Hannah', 'Sophia', 'Olivia', 'Bella', 'Nora', 'Ruby', 'Ivy', 'Jade', 'Faith',
  'Hope', 'Joy', 'Skye', 'Sage', 'Rowan', 'Cameron', 'Hayden', 'Harper', 'Peyton', 'Finley',
  'Parker', 'Reese', 'Sydney', 'Charlie', 'Frankie', 'Jessie', 'Kelly', 'Lee', 'Blair', 'Kim',
  'Jess', 'Ali', 'Andy', 'Tony', 'Steve', 'Dave', 'Paul', 'Mark', 'John', 'James',
  'Peter', 'Mary', 'Jane', 'Helen', 'Laura', 'Rachel', 'Lisa', 'Nina', 'Tina', 'Leah',
  'Maya', 'Cora', 'Elena', 'Sofia', 'Marco', 'Leo', 'Theo', 'Hugo', 'Iris', 'Clara',
  'Miles', 'Henry', 'Oscar', 'Arthur', 'George', 'Harry', 'Oliver', 'Daniel', 'David', 'Michael',
  'Emily', 'Jessica', 'Ashley', 'Megan', 'Lauren', 'Nicole', 'Amanda', 'Stephanie', 'Heather', 'Melissa',
];

export function namesFor(locale: 'th' | 'en'): readonly string[] {
  return locale === 'en' ? EN_NICKNAMES : TH_NICKNAMES;
}

export function randomNickname(locale: 'th' | 'en', opts?: { avoid?: string; random?: () => number }): string {
  const list = namesFor(locale);
  const avoid = opts?.avoid?.trim();
  const rnd = opts?.random ?? Math.random;
  const pool = avoid ? list.filter((name) => name !== avoid) : list;
  const src = pool.length ? pool : list;
  return src[Math.floor(rnd() * src.length)] ?? src[0]!;
}
