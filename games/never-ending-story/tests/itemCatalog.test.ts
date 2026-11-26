import {
  allItems,
  clearItems,
  itemById,
  itemBySlug,
  itemCopy,
  itemForBagId,
  registerItems,
  validateItems,
  type Item,
} from '../src/modules/item/catalog.ts';

declare const process: { exitCode?: number };
let failed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}: ${(e as Error).message}`);
  }
}
function ok(c: boolean, msg: string): void {
  if (!c) throw new Error(msg);
}

const photo: Item = {
  id: '37b6ab64-1fff-4767-8bcb-dd4b6de88b8e',
  kind: 'item-photo',
  title: 'รูปปู่ตอนหนุ่ม',
  titleEn: "Young Grandpa's photo",
  slug: 'album-photo',
  icon: 'items/young-grandpa-photo.png',
  description: 'อยู่ในอัลบั้มจากกล่องรูปดาว พร้อมโปสเตอร์ เอาไปให้ย่าดู',
  descriptionEn: 'From the album in the star box, with the poster. Show it to Grandma.',
};

const key: Item = {
  id: 'dd2ce341-9985-4d84-ae99-79bbff468fcd',
  kind: 'item-key',
  title: 'กุญแจกล่องรูปดาว',
  titleEn: 'Star-box key',
  slug: 'case-key',
  icon: 'items/star-box-key.png',
  description: 'ได้จากการสรุปคดี ใช้เปิดกล่องรูปดาว',
  descriptionEn: 'Awarded for solving the case. Opens the star box.',
};

function setup(): void {
  clearItems();
}

test('validateItems accepts a well-formed catalog', () => {
  setup();
  ok(validateItems([photo, key]).length === 0, validateItems([photo, key]).join('; '));
});

test('validateItems rejects a non-v4 id, a bad slug, and a duplicate slug', () => {
  setup();
  const badId = { ...photo, id: 'not-a-uuid' };
  ok(validateItems([badId]).some((row) => row.includes('UUID')), validateItems([badId]).join('; '));
  const badSlug = { ...photo, slug: 'Album Photo' };
  ok(validateItems([badSlug]).some((row) => row.includes('slug')), validateItems([badSlug]).join('; '));
  const dup = { ...key, slug: 'album-photo' };
  ok(validateItems([photo, dup]).some((row) => row.includes('duplicate slug')), validateItems([photo, dup]).join('; '));
});

test('registerItems looks up by slug, UUID, and bag id', () => {
  setup();
  registerItems([photo, key]);
  ok(allItems().length === 2, String(allItems().length));
  ok(itemBySlug('album-photo')?.id === photo.id, 'slug');
  ok(itemById(photo.id)?.slug === 'album-photo', 'uuid');
  ok(itemForBagId('album-photo')?.title === photo.title, 'bag slug');
  ok(itemForBagId(key.id)?.slug === 'case-key', 'bag uuid');
});

test('itemCopy picks English when asked, otherwise Thai', () => {
  setup();
  const th = itemCopy(photo, 'th');
  const en = itemCopy(photo, 'en');
  ok(th.title === 'รูปปู่ตอนหนุ่ม' && th.description.includes('ย่า'), JSON.stringify(th));
  ok(en.title === "Young Grandpa's photo" && en.description.includes('Grandma'), JSON.stringify(en));
});

test('registerItems throws on an invalid row', () => {
  setup();
  let threw = false;
  try {
    registerItems([{ ...photo, id: 'abc' }]);
  } catch {
    threw = true;
  }
  ok(threw, 'expected a throw');
  ok(allItems().length === 0, 'registry stays empty after a failed register');
});

clearItems();
if (failed) process.exitCode = 1;
