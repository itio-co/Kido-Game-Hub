import {
  allItems,
  allKinds,
  clearItems,
  clearKinds,
  itemById,
  itemBySlug,
  itemCopy,
  itemForBagId,
  itemIconFile,
  itemImageFile,
  kindBySlug,
  kindForItem,
  registerItems,
  registerKinds,
  validateItems,
  validateKinds,
  type Item,
  type ItemKindRecord,
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

const pictureFrame: ItemKindRecord = {
  id: 'e0b95b34-eed9-45f7-943a-897bbfd2c3ed',
  kind: 'item-kind',
  title: 'กรอบรูป',
  titleEn: 'Picture frame',
  slug: 'picture-frame',
  icon: 'items/picture-frame.png',
};

const keyKind: ItemKindRecord = {
  id: 'b05c90d7-ebb3-4c7a-afcd-b4cb2bd9e889',
  kind: 'item-kind',
  title: 'กุญแจ',
  titleEn: 'Key',
  slug: 'key',
  icon: 'items/star-box-key.png',
};

const photo: Item = {
  id: '37b6ab64-1fff-4767-8bcb-dd4b6de88b8e',
  kind: 'picture-frame',
  title: 'รูปปู่ตอนหนุ่ม',
  titleEn: "Young Grandpa's photo",
  slug: 'album-photo',
  image: 'items/young-grandpa-photo.png',
  description: 'อยู่ในอัลบั้มจากกล่องรูปดาว พร้อมโปสเตอร์ เอาไปให้ย่าดู',
  descriptionEn: 'From the album in the star box, with the poster. Show it to Grandma.',
};

const key: Item = {
  id: 'dd2ce341-9985-4d84-ae99-79bbff468fcd',
  kind: 'key',
  title: 'กุญแจกล่องรูปดาว',
  titleEn: 'Star-box key',
  slug: 'case-key',
  image: 'items/star-box-key.png',
  description: 'ได้จากการสรุปคดี ใช้เปิดกล่องรูปดาว',
  descriptionEn: 'Awarded for solving the case. Opens the star box.',
};

function setup(): void {
  clearItems();
  clearKinds();
  registerKinds([pictureFrame, keyKind]);
}

test('validateKinds accepts a well-formed kind catalog', () => {
  clearKinds();
  ok(validateKinds([pictureFrame, keyKind]).length === 0, validateKinds([pictureFrame, keyKind]).join('; '));
});

test('validateKinds rejects a non-v4 id, a bad slug, and a wrong entity kind', () => {
  clearKinds();
  const badId = { ...pictureFrame, id: 'not-a-uuid' };
  ok(validateKinds([badId]).some((row) => row.includes('UUID')), validateKinds([badId]).join('; '));
  const badSlug = { ...pictureFrame, slug: 'Picture Frame' };
  ok(validateKinds([badSlug]).some((row) => row.includes('slug')), validateKinds([badSlug]).join('; '));
  const badType = { ...pictureFrame, kind: 'picture-frame' as ItemKindRecord['kind'] };
  ok(validateKinds([badType]).some((row) => row.includes('item-kind')), validateKinds([badType]).join('; '));
});

test('validateItems accepts a well-formed catalog once kinds are registered', () => {
  setup();
  ok(validateItems([photo, key]).length === 0, validateItems([photo, key]).join('; '));
});

test('validateItems rejects a non-v4 id, a bad slug, a duplicate slug, and an unknown kind', () => {
  setup();
  const badId = { ...photo, id: 'not-a-uuid' };
  ok(validateItems([badId]).some((row) => row.includes('UUID')), validateItems([badId]).join('; '));
  const badSlug = { ...photo, slug: 'Album Photo' };
  ok(validateItems([badSlug]).some((row) => row.includes('slug')), validateItems([badSlug]).join('; '));
  const dup = { ...key, slug: 'album-photo' };
  ok(validateItems([photo, dup]).some((row) => row.includes('duplicate slug')), validateItems([photo, dup]).join('; '));
  const unknown = { ...photo, kind: 'item-photo' };
  ok(validateItems([unknown]).some((row) => row.includes('unknown kind')), validateItems([unknown]).join('; '));
});

test('registerItems looks up by slug, UUID, and bag id', () => {
  setup();
  registerItems([photo, key]);
  ok(allItems().length === 2, String(allItems().length));
  ok(allKinds().length === 2, String(allKinds().length));
  ok(itemBySlug('album-photo')?.id === photo.id, 'slug');
  ok(itemById(photo.id)?.slug === 'album-photo', 'uuid');
  ok(itemForBagId('album-photo')?.title === photo.title, 'bag slug');
  ok(itemForBagId(key.id)?.slug === 'case-key', 'bag uuid');
  ok(kindBySlug('picture-frame')?.title === 'กรอบรูป', 'kind title');
});

test('the grid icon comes from the kind; Item Detail uses the unique image', () => {
  setup();
  registerItems([photo, key]);
  const item = itemBySlug('album-photo')!;
  ok(item.kind === 'picture-frame', item.kind);
  ok(kindForItem(item)?.slug === 'picture-frame', 'kind lookup');
  ok(itemIconFile(item) === 'items/picture-frame.png', String(itemIconFile(item)));
  ok(itemImageFile(item) === 'items/young-grandpa-photo.png', String(itemImageFile(item)));
  ok(itemIconFile(item) !== itemImageFile(item), 'grid icon is not the detail photo');
  const keyItem = itemBySlug('case-key')!;
  ok(keyItem.kind === 'key', keyItem.kind);
  ok(itemIconFile(keyItem) === 'items/star-box-key.png', String(itemIconFile(keyItem)));
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
clearKinds();
if (failed) process.exitCode = 1;
