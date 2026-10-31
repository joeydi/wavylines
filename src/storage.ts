import { DEFAULT_SETTINGS } from './types.ts';
import type { Palette, SceneSettings } from './types.ts';

export const STORAGE_KEY = 'wavy-lines:v1';
interface SavedState { version: 1; palettes: Palette[]; selectedId: string; settings: SceneSettings }
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const hex = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

export function validatePalette(value: unknown): Palette {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id.length || value.id.length > 100 || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80 || !['classic', 'multi'].includes(String(value.mode))) {
    throw new Error('Each palette needs a name and a classic or multi-color mode.');
  }
  const { background, strokes, fills } = value;
  const validColors = (list: unknown, min: number, max: number) => Array.isArray(list) && list.length >= min && list.length <= max && list.every(hex);
  const minimum = value.mode === 'classic' ? 1 : 2, maximum = value.mode === 'classic' ? 1 : 8;
  if (!validColors(background, 2, 2) || !validColors(strokes, minimum, maximum) || !validColors(fills, minimum, maximum)) {
    throw new Error('Palettes need two background colors and valid #RRGGBB colors for each role.');
  }
  return { id: value.id, name: value.name.trim(), mode: value.mode as Palette['mode'], background: [...background as string[]] as [string, string], strokes: [...strokes as string[]], fills: [...fills as string[]] };
}

export function parseImport(json: string): Palette[] {
  if (json.length > 1_000_000) throw new Error('Palette backups must be smaller than 1 MB.');
  let data: unknown;
  try { data = JSON.parse(json); } catch { throw new Error('This file is not valid JSON.'); }
  if (!isRecord(data) || data.version !== 1 || !Array.isArray(data.palettes) || data.palettes.length > 256) {
    throw new Error('Choose a Wavy Lines version 1 palette backup (up to 256 palettes).');
  }
  return data.palettes.map(validatePalette);
}
export function exportPalettes(palettes: Palette[]): string {
  return JSON.stringify({ version: 1, palettes: palettes.filter(p => !p.builtin).map(validatePalette) }, null, 2);
}

export function validateSettings(value: unknown): SceneSettings {
  const settings = { ...DEFAULT_SETTINGS };
  if (!isRecord(value)) return settings;
  const bounds = { intensity: [0, 2], speed: [0.1, 3], curveCount: [8, 160], curvature: [0, 1.5], strokeWidth: [0, 8], strokeOpacity: [0, 1], fillOpacity: [0, 0.1], seed: [0, 4294967295] };
  for (const [key, [min, max]] of Object.entries(bounds)) {
    const number = value[key];
    if (typeof number === 'number' && Number.isFinite(number)) (settings as unknown as Record<string, unknown>)[key] = Math.max(min, Math.min(max, number));
  }
  settings.curveCount = Math.round(settings.curveCount); settings.seed = Math.round(settings.seed);
  if (typeof value.paused === 'boolean') settings.paused = value.paused;
  return settings;
}

export function loadState(storage: Pick<Storage, 'getItem'>): { data?: SavedState; error?: string } {
  try {
    const json = storage.getItem(STORAGE_KEY);
    if (!json) return {};
    const palettes = parseImport(json), data = JSON.parse(json);
    if (typeof data.selectedId !== 'string') throw new Error('Invalid selection');
    return { data: { version: 1, palettes, selectedId: data.selectedId, settings: validateSettings(data.settings) } };
  } catch { return { error: 'Saved settings could not be loaded. You can still create palettes and export a backup.' }; }
}
export function saveState(storage: Pick<Storage, 'setItem'>, data: Omit<SavedState, 'version'>): string | undefined {
  try { storage.setItem(STORAGE_KEY, JSON.stringify({ ...data, version: 1, palettes: data.palettes.filter(p => !p.builtin).map(validatePalette) })); }
  catch { return 'Browser storage is unavailable or full. Your edits are still here; export JSON to keep saved palettes.'; }
}
