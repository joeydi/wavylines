import { createDialKit, createDialRoot } from 'dialkit/vanilla';
import { DEFAULT_SETTINGS } from './types.ts';
import { element } from './ui.ts';
import type { Store } from './store.ts';

export function mountTweaks(store: Store) {
  const s = store.settings;
  const root = createDialRoot({ target: element('dialkit-host'), mode: 'inline', theme: 'light', productionEnabled: true, defaultOpen: true, versions: 'menu' });
  const kit = createDialKit('Wavy Lines', {
    motion: {
      intensity: [s.intensity, 0, 2, 0.01], speed: [s.speed, 0.1, 3, 0.05], paused: s.paused,
    },
    geometry: { curveCount: [s.curveCount, 8, 160, 1], curvature: [s.curvature, 0, 1.5, 0.01], regenerate: { type: 'action' as const, label: 'New composition' } },
    appearance: { strokeWidth: [s.strokeWidth, 0, 8, 0.1], strokeOpacity: [s.strokeOpacity, 0, 1, 0.01], fillOpacity: [s.fillOpacity, 0, 0.1, 0.001] },
    reset: { type: 'action' as const, label: 'Reset tuning' },
  }, {
    id: 'wavy-lines-scene', defaultCollapsed: false,
    onAction(action) {
      if (action === 'geometry.regenerate') store.updateSettings({ seed: crypto.getRandomValues(new Uint32Array(1))[0] });
      if (action === 'reset') store.updateSettings({ ...DEFAULT_SETTINGS, paused: matchMedia('(prefers-reduced-motion: reduce)').matches });
    },
  });
  let syncing = false;
  const unsubscribeKit = kit.subscribe(values => {
    if (syncing) return;
    store.updateSettings({ ...values.motion, curveCount: values.geometry.curveCount, curvature: values.geometry.curvature, ...values.appearance });
  }, false);
  const unsubscribeStore = store.subscribe(kind => {
    if (kind !== 'settings') return;
    syncing = true;
    const current = store.settings;
    kit.setValues({ motion: { intensity: current.intensity, speed: current.speed, paused: current.paused }, geometry: { curveCount: current.curveCount, curvature: current.curvature }, appearance: { strokeWidth: current.strokeWidth, strokeOpacity: current.strokeOpacity, fillOpacity: current.fillOpacity } });
    syncing = false;
  });
  const drawer = element<HTMLDialogElement>('tweaks-drawer');
  element('tweaks').onclick = () => {
    const palettes = element<HTMLDialogElement>('palette-drawer');
    if (palettes.open) palettes.close();
    drawer.showModal();
  };
  element('close-tweaks').onclick = () => drawer.close();
  drawer.addEventListener('close', () => element('tweaks').focus());
  drawer.addEventListener('click', event => {
    if (event.target === drawer) {
      const r = drawer.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) drawer.close();
    }
  });
  return () => { unsubscribeKit(); unsubscribeStore(); kit.destroy(); root.destroy(); };
}
