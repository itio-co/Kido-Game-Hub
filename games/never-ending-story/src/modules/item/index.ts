/** Public entry of the item module: catalog identities plus icon and detail views. */
export {
  ITEM_KINDS,
  allItems,
  clearItems,
  itemById,
  itemBySlug,
  itemCopy,
  itemForBagId,
  registerItems,
  validateItems,
  type Item,
  type ItemKind,
} from './catalog';
export { default as ItemIcon } from './ItemIcon.svelte';
export { default as ItemDetail } from './ItemDetail.svelte';
