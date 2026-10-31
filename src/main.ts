import './styles.css';
import { Motion } from './motion.ts';
import { WaveRenderer } from './renderer.ts';
import { Store } from './store.ts';
import { PaletteUI, element } from './ui.ts';
import { mountTweaks } from './tweaks.ts';
import { FrameLoop } from './animation.ts';

const store = new Store();
const ui = new PaletteUI(store);
const destroyTweaks = mountTweaks(store);
const canvas = element<HTMLCanvasElement>('waves');
let renderer: WaveRenderer | undefined;
let motion = new Motion(store.settings.seed), seed = store.settings.seed;
const status = (message: string) => {
  element('renderer-status').textContent = message;
  element('renderer-status').hidden = !message;
};
const loop = new FrameLoop(
  { request: callback => requestAnimationFrame(callback), cancel: id => cancelAnimationFrame(id), visible: () => !document.hidden },
  () => Boolean(renderer?.available) && !store.settings.paused && store.settings.intensity > 0,
  () => store.settings.speed,
  time => renderer?.render(motion.sample(time, store.settings.intensity), store.settings),
);
try {
  renderer = new WaveRenderer(canvas, status, loop.invalidate);
  renderer.setPalette(store.palette);
} catch (error) { status(error instanceof Error ? error.message : 'The artwork could not start. You can still explore palettes.'); }

function updateInterface() {
  const s = store.settings;
  element<HTMLInputElement>('intensity').value = String(Math.round(s.intensity * 100));
  element<HTMLOutputElement>('intensity-value').value = `${Math.round(s.intensity * 100)}%`;
  element('play-label').textContent = s.paused ? 'Play' : 'Pause';
  element('play-icon').textContent = s.paused ? '▷' : 'Ⅱ';
  element('play').setAttribute('aria-label', s.paused ? 'Play animation' : 'Pause animation');
  element('play').setAttribute('aria-pressed', String(s.paused));
}
function updatePalette() {
  const palette = store.palette;
  element('app').style.background = `linear-gradient(${palette.background[0]}, ${palette.background[1]})`;
  renderer?.setPalette(palette);
}
const unsubscribe = store.subscribe(kind => {
  if (kind === 'status') return;
  if (kind === 'palette' || kind === 'library') updatePalette();
  if (store.settings.seed !== seed) {
    seed = store.settings.seed; motion = new Motion(seed); loop.reset();
  }
  updateInterface(); loop.invalidate();
});
element<HTMLInputElement>('intensity').oninput = event => store.updateSettings({ intensity: Number((event.target as HTMLInputElement).value) / 100 });
element('play').onclick = () => store.updateSettings({ paused: !store.settings.paused });
const resize = () => { renderer?.resize(innerWidth, innerHeight, devicePixelRatio); loop.invalidate(); };
const observer = new ResizeObserver(resize); observer.observe(element('app'));
window.addEventListener('resize', resize);
document.addEventListener('visibilitychange', loop.visibilityChanged);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const onReducedMotion = () => { if (reducedMotion.matches) store.updateSettings({ paused: true }); };
reducedMotion.addEventListener('change', onReducedMotion);
const flush = () => store.flush();
window.addEventListener('pagehide', flush);
updatePalette(); updateInterface(); resize();

if (import.meta.hot) import.meta.hot.dispose(() => {
  loop.destroy(); renderer?.destroy(); observer.disconnect(); unsubscribe(); destroyTweaks(); ui.destroy(); store.destroy();
  window.removeEventListener('resize', resize);
  window.removeEventListener('pagehide', flush);
  document.removeEventListener('visibilitychange', loop.visibilityChanged);
  reducedMotion.removeEventListener('change', onReducedMotion);
});
