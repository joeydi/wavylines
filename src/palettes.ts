import type { Palette } from './types.ts';

const classic = (id: string, name: string, top: string, bottom: string, stroke: string, fill: string): Palette =>
  ({ id, name, mode: 'classic', background: [top, bottom], strokes: [stroke], fills: [fill], builtin: true });

export const BUILTIN_PALETTES: Palette[] = [
  classic('tidal', 'Tidal', '#3efccd', '#055dc5', '#f74d5f', '#0f1560'),
  classic('sunset', 'Soft sunset', '#ffc371', '#ff5f6d', '#68113e', '#68113e'),
  classic('electric', 'Electric violet', '#dc21a5', '#0138ef', '#fcc05f', '#0f1560'),
  classic('midnight', 'Midnight', '#1b245e', '#000330', '#494e81', '#68113e'),
  classic('lavender', 'Lavender', '#ffffff', '#d5a2dd', '#1831bd', '#fdccac'),
  classic('orchid', 'Orchid', '#f9e7fb', '#b17fb9', '#0f1560', '#f74d5f'),
  classic('peach', 'Peach paper', '#fef1ec', '#c9837b', '#fdccac', '#1831bd'),
  classic('citrus', 'Citrus', '#fcc935', '#ea6d1f', '#2b3548', '#2b3548'),
  classic('dusk', 'Blue dusk', '#f99170', '#506887', '#68113e', '#494e81'),
  classic('ember', 'Ember', '#f99170', '#861309', '#ffffff', '#68113e'),
  classic('apricot', 'Apricot', '#fcd0ad', '#fa6d4b', '#68113e', '#0f1560'),
  { id: 'spectrum', name: 'After hours', mode: 'multi', background: ['#141b35', '#080e20'], strokes: ['#82f4d1', '#b7a3ff', '#ff728b', '#ffc97b'], fills: ['#175d70', '#582769', '#8e425c'], builtin: true },
  { id: 'lagoon', name: 'Lagoon', mode: 'multi', background: ['#bff5d8', '#147e93'], strokes: ['#faffc0', '#3efccd', '#254fa2'], fills: ['#286c9c', '#194b65'], builtin: true },
  { id: 'sorbet', name: 'Sorbet', mode: 'multi', background: ['#fff0da', '#e7aec5'], strokes: ['#d96578', '#815eb7', '#337e9c'], fills: ['#edac87', '#b17fb9', '#748fc1'], builtin: true },
];

export function copyPalette(palette: Palette): Palette {
  return { ...palette, background: [...palette.background], strokes: [...palette.strokes], fills: [...palette.fills] };
}

export function changeMode(palette: Palette, mode: Palette['mode']): Palette {
  const next = copyPalette(palette); next.mode = mode;
  for (const role of ['strokes', 'fills'] as const) {
    next[role] = mode === 'classic' ? [next[role][0]] : next[role].length > 1 ? next[role] : [next[role][0], next.background[1]];
  }
  return next;
}
