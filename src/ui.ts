import { changeMode, copyPalette } from './palettes.ts';
import { interpolateColors, rgbToHex } from './color.ts';
import { paletteFromImage } from './image.ts';
import { suggestedPalette } from './extraction.ts';
import { exportPalettes, parseImport } from './storage.ts';
import type { Store } from './store.ts';
import type { Palette } from './types.ts';

export const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const button = (label: string, action: () => void, className = '') => {
  const node = document.createElement('button'); node.type = 'button'; node.textContent = label; node.className = className; node.onclick = action; return node;
};

export class PaletteUI {
  private drawer = element<HTMLDialogElement>('palette-drawer');
  private draft?: Palette;
  private previous?: Palette;
  private extracted: string[] = [];
  private abort?: AbortController;
  private toastTimer?: ReturnType<typeof setTimeout>;
  private dragDepth = 0;
  private lifetime = new AbortController();

  constructor(private store: Store) {
    ['palettes', 'current-palette'].forEach(id => element(id).onclick = () => this.open());
    this.drawer.querySelector<HTMLButtonElement>('.close-drawer')!.onclick = () => this.close();
    this.drawer.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
    this.drawer.addEventListener('click', event => { if (event.target === this.drawer) {
      const rect = this.drawer.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) this.close();
    } });
    element('new-palette').onclick = () => {
      this.begin({ ...copyPalette(this.store.palette), id: crypto.randomUUID(), builtin: false, name: 'Untitled palette' });
    };
    element('edit-palette').onclick = () => this.begin(this.store.palette);
    element('duplicate-palette').onclick = () => this.begin({ ...copyPalette(this.store.palette), id: crypto.randomUUID(), builtin: false, name: `${this.store.palette.name} copy`.slice(0, 80) });
    element('delete-palette').onclick = () => { element('delete-confirmation').hidden = false; element('confirm-delete').focus(); };
    element('cancel-delete').onclick = () => { element('delete-confirmation').hidden = true; element('delete-palette').focus(); };
    element('confirm-delete').onclick = () => { this.store.remove(this.store.palette.id); element('delete-confirmation').hidden = true; this.renderLibrary(); this.notice('Palette deleted.'); };
    ['back-library', 'cancel-editor'].forEach(id => element(id).onclick = () => this.cancel());
    element('apply-preview').onclick = () => { this.draft = undefined; this.previous = undefined; this.showLibrary(); this.notice('Applied for this visit. Save a palette to keep it after reloading.'); };
    element('save-palette').onclick = () => this.save();
    element<HTMLInputElement>('palette-title').oninput = event => { if (this.draft) this.draft.name = (event.target as HTMLInputElement).value; };
    this.drawer.querySelectorAll<HTMLInputElement>('input[name="palette-mode"]').forEach(input => input.onchange = () => {
      if (!this.draft) return;
      this.draft = changeMode(this.draft, input.value as Palette['mode']);
      if (input.value === 'multi' && this.extracted.length > 1) {
        this.draft.strokes = [...this.extracted]; this.draft.fills = [...this.extracted].reverse();
      }
      this.renderColors(); this.preview();
    });
    ['image-palette', 'image-drop'].forEach(id => element(id).onclick = () => element<HTMLInputElement>('image-file').click());
    element<HTMLInputElement>('image-file').onchange = event => {
      const input = event.target as HTMLInputElement, file = input.files?.[0]; input.value = ''; if (file) void this.extract(file);
    };
    element('import-palettes').onclick = () => element<HTMLInputElement>('import-file').click();
    element<HTMLInputElement>('import-file').onchange = event => {
      const input = event.target as HTMLInputElement, file = input.files?.[0]; input.value = ''; if (file) void this.import(file);
    };
    element('export-palettes').onclick = () => {
      const blob = new Blob([exportPalettes(this.store.palettes)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), anchor = document.createElement('a');
      anchor.href = url; anchor.download = 'wavy-lines-palettes.json'; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.notice('Exported your saved custom palettes. Built-in palettes are always included in the app.');
    };
    this.setupDrop();
    store.subscribe(kind => {
      if (kind === 'palette' || kind === 'library') this.updateBadge();
      if (kind === 'library' || (kind === 'palette' && !this.draft)) this.renderLibrary();
      if (store.error) this.notice(store.error, true);
    });
    this.renderLibrary(); this.updateBadge();
    if (store.error) this.toast(store.error, true);
  }

  private notice(message: string, error = false) {
    const notice = element('palette-notice'); notice.textContent = message; notice.classList.toggle('error', error); notice.hidden = !message;
  }
  toast(message: string, persistent = false) {
    const toast = element('toast'); clearTimeout(this.toastTimer); toast.textContent = message; toast.hidden = false;
    this.toastTimer = setTimeout(() => { toast.hidden = true; }, persistent ? 10000 : 4500);
  }
  open() {
    const tweaks = element<HTMLDialogElement>('tweaks-drawer'); if (tweaks.open) tweaks.close();
    if (!this.drawer.open) this.drawer.showModal();
    this.renderLibrary();
    if (this.store.error) this.notice(this.store.error, true);
  }
  private close() {
    this.abort?.abort();
    element('toast').hidden = true;
    if (this.draft) this.cancel();
    this.drawer.close(); element('palettes').focus();
  }
  private updateBadge() {
    element('palette-name').textContent = this.store.palette.name;
    const dots = document.querySelector('.palette-dots')!; dots.replaceChildren();
    const p = this.store.palette;
    for (const color of [p.background[0], p.background[1], ...p.strokes.slice(0, 2)]) {
      const dot = document.createElement('i'); dot.style.background = color; dots.append(dot);
    }
  }
  private renderLibrary() {
    const builtin = this.store.palettes.filter(p => p.builtin), custom = this.store.palettes.filter(p => !p.builtin);
    element('builtin-count').textContent = String(builtin.length); element('custom-count').textContent = String(custom.length);
    element('empty-library').hidden = custom.length > 0;
    for (const [id, palettes] of [['builtin-palettes', builtin], ['custom-palettes', custom]] as const) {
      const host = element(id); host.replaceChildren();
      for (const palette of palettes) {
        const card = button('', () => { this.store.select(palette.id); this.notice(''); }, 'palette-card');
        card.setAttribute('aria-label', palette.name); card.setAttribute('aria-pressed', String(palette.id === this.store.palette.id));
        const art = document.createElement('div'); art.className = 'palette-art'; art.setAttribute('aria-hidden', 'true');
        art.style.background = `linear-gradient(${palette.background[0]},${palette.background[1]})`;
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 160 80'); svg.setAttribute('preserveAspectRatio', 'none');
        for (let i = 0; i < 12; i++) {
          const path = document.createElementNS(svg.namespaceURI, 'path');
          path.setAttribute('d', `M-10 ${30 + i * 4} C 40 ${-35 + i * 10}, 70 ${120 - i * 5}, 170 ${18 + i * 3}`);
          path.setAttribute('stroke', rgbToHex(interpolateColors(palette.strokes, i / 11))); path.setAttribute('stroke-width', '.9'); path.setAttribute('fill', palette.fills[Math.floor(i / 12 * palette.fills.length)]); path.setAttribute('fill-opacity', '.035');
          svg.append(path);
        }
        art.append(svg); card.append(art);
        const label = document.createElement('div'); label.className = 'palette-card-label';
        const title = document.createElement('strong'); title.textContent = palette.name;
        const mode = document.createElement('span'); mode.textContent = palette.mode === 'multi' ? 'MULTI' : 'CLASSIC'; label.append(title, mode); card.append(label); host.append(card);
      }
    }
    element('delete-palette').hidden = Boolean(this.store.palette.builtin) || !this.store.palettes.some(p => p.id === this.store.palette.id);
  }
  private begin(palette: Palette, extracted: string[] = []) {
    if (!this.previous) this.previous = copyPalette(this.store.palette);
    this.draft = copyPalette(palette); this.extracted = extracted;
    element('library-view').hidden = true; element('editor-view').hidden = false;
    element('drawer-title').textContent = extracted.length ? 'Found in your image.' : 'Make it yours.';
    element('editor-description').textContent = extracted.length ? 'A starting point, drawn from your image. Adjust any color below.' : palette.builtin ? 'Start with the collection. Save your own variation.' : 'Make it your own. Changes preview live.';
    this.notice('');
    element<HTMLInputElement>('palette-title').value = this.draft.name;
    this.drawer.querySelector<HTMLInputElement>(`input[name="palette-mode"][value="${this.draft.mode}"]`)!.checked = true;
    element('extracted-colors').hidden = !extracted.length;
    const swatches = element('extracted-swatches'); swatches.replaceChildren();
    for (const color of extracted) {
      const swatch = button('', () => { this.notice(`Extracted color: ${color.toUpperCase()}. Enter it in any hex field below.`); }, '');
      swatch.style.background = color; swatch.title = color; swatch.setAttribute('aria-label', `Extracted ${color}`); swatches.append(swatch);
    }
    this.renderColors(); this.preview(); this.open();
    element<HTMLInputElement>('palette-title').focus(); this.drawer.scrollTop = 0;
  }
  private preview() { if (this.draft) this.store.preview(this.draft); }
  private renderColors() {
    if (!this.draft) return;
    const host = element('palette-colors'); host.replaceChildren();
    for (const [role, name] of [['background', 'Background gradient'], ['strokes', 'Line colors'], ['fills', 'Fill colors']] as const) {
      const group = document.createElement('section'); group.className = 'color-group';
      const heading = document.createElement('div'); heading.className = 'color-group-heading';
      const title = document.createElement('h3'); title.textContent = name; heading.append(title);
      const canOrder = role !== 'background' && this.draft.mode === 'multi';
      if (canOrder) {
        const add = button('+ Add color', () => {
          if (!this.draft || this.draft[role].length >= 8) return;
          this.draft[role].push(this.draft.background[0]); this.renderColors(); this.preview();
        }, 'text-button');
        add.disabled = this.draft[role].length >= 8; heading.append(add);
      }
      group.append(heading);
      this.draft[role].forEach((color, index) => {
        const row = document.createElement('div'); row.className = 'color-row';
        const input = document.createElement('input'); input.type = 'color'; input.value = color;
        const label = role === 'background' ? `Background ${index === 0 ? 'top' : 'bottom'}` : `${role === 'strokes' ? 'Line' : 'Fill'} color ${index + 1}`;
        input.setAttribute('aria-label', label);
        const text = document.createElement('input'); text.className = 'hex-input'; text.value = color.toUpperCase(); text.maxLength = 7; text.spellcheck = false; text.setAttribute('aria-label', `${label} hex`); text.pattern = '#[0-9a-fA-F]{6}';
        input.oninput = () => { if (!this.draft) return; this.draft[role][index] = input.value; text.value = input.value.toUpperCase(); text.setCustomValidity(''); this.preview(); };
        text.onchange = () => {
          const value = text.value.trim();
          if (!/^#[0-9a-f]{6}$/i.test(value)) { text.setCustomValidity('Enter a color such as #3EFCCD.'); text.reportValidity(); return; }
          text.setCustomValidity(''); if (!this.draft) return;
          this.draft[role][index] = value.toLowerCase(); input.value = value; this.preview();
        };
        row.append(input, text);
        if (canOrder) {
          const controls = document.createElement('div'); controls.className = 'reorder-buttons';
          for (const direction of [-1, 1]) {
            const move = button(direction === -1 ? '↑' : '↓', () => {
              if (!this.draft) return;
              const colors = this.draft[role]; [colors[index], colors[index + direction]] = [colors[index + direction], colors[index]];
              this.renderColors(); this.preview();
              host.querySelector<HTMLButtonElement>(`[data-order="${role}-${index + direction}-${direction}"]`)?.focus();
            });
            move.setAttribute('aria-label', `Move ${label.toLowerCase()} ${direction === -1 ? 'up' : 'down'}`);
            move.dataset.order = `${role}-${index}-${direction}`;
            move.disabled = index + direction < 0 || index + direction >= this.draft![role].length; controls.append(move);
          }
          const remove = button('×', () => { if (this.draft) { this.draft[role].splice(index, 1); this.renderColors(); this.preview(); } });
          remove.setAttribute('aria-label', `Remove ${label.toLowerCase()}`); remove.disabled = this.draft![role].length <= 2; controls.append(remove); row.append(controls);
        } else {
          const caption = document.createElement('span'); caption.className = 'color-caption'; caption.textContent = role === 'background' ? index === 0 ? 'Top' : 'Bottom' : role === 'strokes' ? 'Across the lines' : 'Translucent layers'; row.append(caption);
        }
        group.append(row);
      });
      host.append(group);
      if (canOrder) { const help = document.createElement('p'); help.className = 'field-help'; help.textContent = 'Colors blend from the first curve to the last.'; group.append(help); }
    }
  }
  private save() {
    if (!this.draft) return;
    const invalid = this.drawer.querySelector<HTMLInputElement>('input:invalid');
    if (invalid) { invalid.reportValidity(); invalid.focus(); return; }
    try {
      this.store.save(this.draft); this.store.flush(); this.draft = undefined; this.previous = undefined; this.showLibrary();
      this.notice(this.store.error || 'Palette saved to your collection.', Boolean(this.store.error));
    } catch (error) { this.notice((error as Error).message, true); element('palette-title').focus(); }
  }
  private cancel() {
    if (this.previous) this.store.preview(this.previous);
    this.draft = undefined; this.previous = undefined; this.extracted = []; this.showLibrary(); this.notice('');
  }
  private showLibrary() {
    element('editor-view').hidden = true; element('library-view').hidden = false;
    element('drawer-title').textContent = 'Palettes.'; this.renderLibrary(); this.drawer.scrollTop = 0;
    element('new-palette').focus();
  }
  private async extract(file: File) {
    this.abort?.abort(); const abort = new AbortController(); this.abort = abort;
    if (this.drawer.open) this.notice('Finding the colors in your image…');
    else this.toast('Finding the colors in your image…', true);
    try {
      const colors = await paletteFromImage(file, abort.signal);
      if (abort.signal.aborted) return;
      element('toast').hidden = true;
      if (this.draft) this.cancel();
      this.begin(suggestedPalette(colors, file.name), colors);
    } catch (error) {
      if (!abort.signal.aborted) {
        if (this.drawer.open) this.notice((error as Error).message, true);
        else this.toast((error as Error).message, true);
      }
    }
  }
  private async import(file: File) {
    try {
      if (file.size > 1_000_000) throw new Error('Palette backups must be smaller than 1 MB.');
      const palettes = parseImport(await file.text()); this.store.import(palettes); this.store.flush();
      this.notice(this.store.error || `Imported ${palettes.length} palette${palettes.length === 1 ? '' : 's'} into your collection.`, Boolean(this.store.error));
    } catch (error) { this.notice((error as Error).message, true); }
  }
  private setupDrop() {
    const options = { signal: this.lifetime.signal };
    const containsFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files');
    const hide = () => { this.dragDepth = 0; element('drop-overlay').hidden = true; this.drawer.classList.remove('dragging'); };
    window.addEventListener('dragenter', event => { if (containsFiles(event)) { event.preventDefault(); this.dragDepth++; element('drop-overlay').hidden = false; } }, options);
    window.addEventListener('dragover', event => { if (containsFiles(event)) { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'; } }, options);
    window.addEventListener('dragleave', event => { if (containsFiles(event) && --this.dragDepth <= 0) hide(); }, options);
    window.addEventListener('drop', event => {
      event.preventDefault(); hide(); const file = event.dataTransfer?.files[0]; if (file) void this.extract(file);
    }, options);
    window.addEventListener('blur', hide, options);
  }
  destroy() { this.abort?.abort(); this.lifetime.abort(); clearTimeout(this.toastTimer); }
}
