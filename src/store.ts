import { BUILTIN_PALETTES, copyPalette } from './palettes.ts';
import { loadState, saveState, validateSettings } from './storage.ts';
import { DEFAULT_SETTINGS } from './types.ts';
import type { Palette, SceneSettings } from './types.ts';

type StoreChange = 'settings' | 'palette' | 'library' | 'status';

export class Store {
  settings: SceneSettings;
  palettes: Palette[];
  palette: Palette;
  selectedId: string;
  error = '';
  private listeners = new Set<(kind: StoreChange) => void>();
  private storage?: Storage;
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    try { this.storage = window.localStorage; } catch { /* Private/restricted storage. */ }
    const loaded = this.storage ? loadState(this.storage) : { error: 'Browser storage is unavailable. Export JSON to keep your saved palettes.' };
    this.error = loaded.error ?? '';
    this.palettes = [...BUILTIN_PALETTES.map(copyPalette), ...(loaded.data?.palettes ?? []).filter(p => !BUILTIN_PALETTES.some(b => b.id === p.id))];
    this.settings = loaded.data?.settings ?? { ...DEFAULT_SETTINGS };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) this.settings.paused = true;
    this.selectedId = loaded.data?.selectedId ?? 'tidal';
    this.palette = copyPalette(this.palettes.find(p => p.id === this.selectedId) ?? this.palettes[0]);
    this.selectedId = this.palette.id;
  }
  subscribe(listener: (kind: StoreChange) => void) {
    this.listeners.add(listener); return () => this.listeners.delete(listener);
  }
  private emit(kind: StoreChange, persist = true) {
    if (persist) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        const previousError = this.error; this.flush();
        if (this.error !== previousError) this.listeners.forEach(fn => fn('status'));
      }, 200);
    }
    this.listeners.forEach(fn => fn(kind));
  }
  flush() {
    clearTimeout(this.timer);
    if (this.storage) this.error = saveState(this.storage, { palettes: this.palettes, selectedId: this.selectedId, settings: this.settings }) ?? '';
  }
  updateSettings(update: Partial<SceneSettings>) {
    const next = validateSettings({ ...this.settings, ...update });
    if (Object.keys(next).every(key => next[key as keyof SceneSettings] === this.settings[key as keyof SceneSettings])) return;
    this.settings = next; this.emit('settings');
  }
  preview(palette: Palette) { this.palette = copyPalette(palette); this.emit('palette', false); }
  select(id: string) {
    const palette = this.palettes.find(p => p.id === id);
    if (!palette) return;
    this.selectedId = id; this.palette = copyPalette(palette); this.emit('palette');
  }
  save(palette: Palette): Palette {
    const next = copyPalette(palette); next.builtin = false;
    if (!next.name.trim()) throw new Error('Give your palette a name before saving.');
    next.name = next.name.trim().slice(0, 80);
    if (palette.builtin || !this.palettes.some(p => p.id === palette.id)) next.id = crypto.randomUUID();
    const index = this.palettes.findIndex(p => p.id === next.id);
    if (index === -1 && this.palettes.filter(p => !p.builtin).length >= 256) throw new Error('The library can hold up to 256 custom palettes.');
    if (index === -1) this.palettes.push(next); else this.palettes[index] = next;
    this.selectedId = next.id; this.palette = copyPalette(next); this.emit('library'); return next;
  }
  remove(id: string) {
    this.palettes = this.palettes.filter(p => p.id !== id || p.builtin);
    if (this.selectedId === id) { this.selectedId = 'tidal'; this.palette = copyPalette(this.palettes[0]); }
    this.emit('library');
  }
  import(palettes: Palette[]) {
    if (this.palettes.filter(p => !p.builtin).length + palettes.length > 256) throw new Error('The library can hold up to 256 custom palettes.');
    this.palettes.push(...palettes.map(p => ({ ...copyPalette(p), id: crypto.randomUUID(), builtin: false })));
    this.emit('library');
  }
  destroy() { this.flush(); this.listeners.clear(); }
}
