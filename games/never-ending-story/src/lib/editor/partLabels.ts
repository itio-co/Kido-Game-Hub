import { t, type MessageKey } from '../i18n/core';

/** Display names for part names from the Blender build scripts (Leg_LF, Stretcher_R, …). Unknown names pass through. */
const WORDS: Record<string, MessageKey> = {
  TopSlab: 'editor.partName.topSlab',
  Leg: 'editor.partName.leg',
  Apron: 'editor.partName.apron',
  Rail: 'editor.partName.rail',
  Drawer: 'editor.partName.drawer',
  Face: 'editor.partName.face',
  Cavity: 'editor.partName.cavity',
  Knob: 'editor.partName.knob',
  Stretcher: 'editor.partName.stretcher',
  Top: 'editor.partName.top',
  Bot: 'editor.partName.bot',
  Box: 'editor.partName.box',
  Bottom: 'editor.partName.bottom',
};
const SIDES: Record<string, MessageKey> = {
  L: 'editor.partName.sideL',
  R: 'editor.partName.sideR',
  F: 'editor.partName.sideF',
  B: 'editor.partName.sideB',
};

export function partLabel(name: string): string {
  const copy = name.match(/_copy(\d+)$/);
  const core = copy ? name.slice(0, copy.index) : name;
  const words = core.split('_').map((word) => {
    if (WORDS[word]) return t(WORDS[word]);
    if (/^[LRFB]{1,2}$/.test(word)) {
      const [a, b] = [...word].map((c) => t(SIDES[c]));
      return b === undefined ? a : t('editor.partName.sideJoin', { a, b });
    }
    return word;
  });
  const label = words.join(' ');
  return copy ? t('editor.partName.copy', { name: label, n: copy[1] }) : label;
}
