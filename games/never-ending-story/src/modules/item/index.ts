/** Public entry of the item module: kinds, unique items, and the icon plus detail views. */
import './kinds';
export {
  ITEM_KIND_TYPE,
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
  kindById,
  kindBySlug,
  kindCopy,
  kindForItem,
  registerItems,
  registerKinds,
  validateItems,
  validateKinds,
  type Item,
  type ItemKindRecord,
} from './catalog';
export { default as ItemIcon } from './ItemIcon.svelte';
export { default as ItemDetail } from './ItemDetail.svelte';
