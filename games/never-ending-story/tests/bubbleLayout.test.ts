import { clampToBounds, placeBubble, rectsOverlap, type Rect } from '../src/modules/event-core/bubbleLayout.ts';

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
function almost(a: number, b: number, msg: string, slop = 0.6): void {
  if (Math.abs(a - b) > slop) throw new Error(`${msg}: ${a} !== ${b}`);
}

const bounds: Rect = { x: 10, y: 10, w: 180, h: 300 };

test('already clear of masks stays put (aside from bounds clamp)', () => {
  const box = { x: 20, y: 40, w: 50, h: 40 };
  const placed = placeBubble({ box, bounds, masks: [{ x: 100, y: 40, w: 40, h: 40 }], minW: 30 });
  almost(placed.x, 20, 'x');
  almost(placed.y, 40, 'y');
  almost(placed.w, 50, 'w');
});

test('a bubble over a face is moved to the preferred free side', () => {
  // Face on the right half; bubble starts overlapping it from the left.
  const mask = { x: 80, y: 40, w: 60, h: 50 };
  const box = { x: 50, y: 45, w: 50, h: 40 };
  ok(rectsOverlap(box, mask), 'setup overlaps');
  const placed = placeBubble({ box, bounds, masks: [mask], minW: 30, gap: 4 });
  ok(!rectsOverlap(placed, mask), 'clears the mask');
  ok(placed.x >= bounds.x && placed.x + placed.w <= bounds.x + bounds.w, 'inside bounds x');
  ok(placed.y >= bounds.y && placed.y + placed.h <= bounds.y + bounds.h, 'inside bounds y');
  // Prefer shifting left of the face, close to the authored y.
  ok(placed.x + placed.w <= mask.x - 4 + 0.6, 'sits to the left of the face');
  almost(placed.y, 45, 'keeps authored y when a side shift works');
});

test('when the left gap is too tight, it tries the other sides', () => {
  // Bounds start at x=10; a face at x=40 leaves only 30px on the left — too narrow for w=50.
  const mask = { x: 40, y: 80, w: 80, h: 40 };
  const box = { x: 20, y: 85, w: 50, h: 30 };
  const placed = placeBubble({ box, bounds, masks: [mask], minW: 30, gap: 4 });
  ok(!rectsOverlap(placed, mask), 'clears the mask');
  ok(placed.x >= bounds.x && placed.x + placed.w <= bounds.x + bounds.w, 'inside bounds');
  const leftOf = placed.x + placed.w <= mask.x - 4 + 0.6;
  const rightOf = placed.x >= mask.x + mask.w + 4 - 0.6;
  const above = placed.y + placed.h <= mask.y - 4 + 0.6;
  const below = placed.y >= mask.y + mask.h + 4 - 0.6;
  ok(leftOf || rightOf || above || below, 'sits on one of the four sides');
});

test('shrinks width and reflows height to fit a tight column', () => {
  // Face spans the full height, leaving only a ~42px column on the left; authored width is 70.
  const mask = { x: 52, y: 10, w: 120, h: 300 };
  const box = { x: 12, y: 40, w: 70, h: 30 };
  const placed = placeBubble({
    box,
    bounds,
    masks: [mask],
    minW: 28,
    gap: 4,
    heightAtWidth: (w) => 30 * (70 / w), // taller when narrower
  });
  ok(!rectsOverlap(placed, mask), 'clears the mask after shrink');
  ok(placed.w < 70 - 0.5, 'width shrank');
  ok(placed.w >= 28 - 0.5, 'not below minW');
  ok(placed.h > 30 + 0.5, 'height reflowed');
});

test('stays inside the inset bounds even when the authored box overflows', () => {
  const box = { x: 0, y: 0, w: 50, h: 40 };
  const placed = placeBubble({ box, bounds, masks: [], minW: 30 });
  const clamped = clampToBounds(box, bounds);
  almost(placed.x, clamped.x, 'x');
  almost(placed.y, clamped.y, 'y');
  ok(placed.x >= bounds.x && placed.y >= bounds.y, 'not outside origin');
});

test('grid fallback finds a hole when side shifts cannot fit', () => {
  // A large face leaves a hole in the bottom-right.
  const mask = { x: 10, y: 10, w: 140, h: 220 };
  const box = { x: 20, y: 20, w: 40, h: 40 };
  const placed = placeBubble({ box, bounds, masks: [mask], minW: 30, gap: 4 });
  ok(!rectsOverlap(placed, mask), 'clears via a free cell');
  ok(placed.x + placed.w <= bounds.x + bounds.w + 0.5, 'inside right');
  ok(placed.y + placed.h <= bounds.y + bounds.h + 0.5, 'inside bottom');
});

test('rectsOverlap is the same test the e2e uses (with slop)', () => {
  ok(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 9.4, y: 0, w: 10, h: 10 }), '0.6px overlap counts');
  ok(!rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }), 'touching edge is not a hit');
});

if (failed) {
  console.error(`${failed} failed`);
  process.exitCode = 1;
} else {
  console.log('bubbleLayout: all passed');
}
