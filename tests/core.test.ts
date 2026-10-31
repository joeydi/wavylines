import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Motion } from '../src/motion.ts';
import { FrameLoop } from '../src/animation.ts';
import { interpolateColors, hexToRgb, rgbToHex, colorTable } from '../src/color.ts';
import { BUILTIN_PALETTES, changeMode } from '../src/palettes.ts';
import { exportPalettes, parseImport, loadState, saveState, validateSettings, STORAGE_KEY } from '../src/storage.ts';
import { extractColors } from '../src/extraction.ts';
import { DEFAULT_SETTINGS } from '../src/types.ts';

test('motion is deterministic across seeds and frame rates', () => {
  const a = new Motion(123), b = new Motion(123), c = new Motion(456);
  for (let time = 0; time < 24; time += 1 / 60) a.sample(time, 1);
  assert.deepEqual(a.sample(24, 1), b.sample(24, 1));
  assert.notDeepEqual(b.points, c.sample(24, 1));
});
test('intensity scales displacement and zero is stationary', () => {
  const base = new Motion(42).sample(3, 0), single = new Motion(42).sample(3, 1), double = new Motion(42).sample(3, 2);
  assert.deepEqual(base, new Motion(42).sample(30, 0));
  single.forEach((v, i) => assert.ok(Math.abs((double[i] - base[i]) - (v - base[i]) * 2) < 0.000001));
});
test('OKLab interpolation preserves endpoints and follows perceptual lightness', () => {
  assert.equal(rgbToHex(interpolateColors(['#ff0000', '#0000ff'], 0)), '#ff0000');
  assert.equal(rgbToHex(interpolateColors(['#ff0000', '#0000ff'], 1)), '#0000ff');
  assert.equal(rgbToHex(interpolateColors(['#000000', '#ffffff'], .5)), '#636363');
  assert.deepEqual(interpolateColors(['#3efccd'], .7), hexToRgb('#3efccd'));
  assert.deepEqual(Array.from(colorTable(['#ffffff'], 2)), [255,255,255,255,255,255,255,255]);
});
test('all built-ins validate and classic/multi conversion keeps color roles', () => {
  const customs = BUILTIN_PALETTES.map(p => ({ ...p, builtin: false }));
  assert.equal(parseImport(exportPalettes(customs)).length, customs.length);
  const multi = changeMode(BUILTIN_PALETTES[0], 'multi');
  assert.equal(multi.strokes.length, 2);
  assert.equal(changeMode(multi, 'classic').strokes.length, 1);
  assert.equal(BUILTIN_PALETTES[0].strokes.length, 1);
});
test('JSON round trips only saved custom palettes and validates the whole import', () => {
  const custom = { ...BUILTIN_PALETTES[0], builtin: false, id: 'custom', name: 'My palette' };
  const parsed = parseImport(exportPalettes([...BUILTIN_PALETTES, custom]));
  assert.equal(parsed.length, 1); assert.equal(parsed[0].name, 'My palette');
  assert.throws(() => parseImport('{'), /valid JSON/);
  assert.throws(() => parseImport('{"version":2,"palettes":[]}'), /version 1/);
  assert.throws(() => parseImport(JSON.stringify({ version: 1, palettes: [{ ...custom, strokes: ['javascript:alert(1)'] }] })), /valid #RRGGBB/);
  assert.throws(() => parseImport(JSON.stringify({ version: 1, palettes: [{ ...custom, mode: 'multi' }] })), /valid #RRGGBB/);
});
test('storage round trip, denied storage and malformed storage are recoverable', () => {
  const memory = new Map<string, string>();
  const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); } };
  assert.equal(saveState(storage, { palettes: BUILTIN_PALETTES, selectedId: 'tidal', settings: DEFAULT_SETTINGS }), undefined);
  assert.equal(loadState(storage).data?.selectedId, 'tidal');
  memory.set(STORAGE_KEY, 'broken'); assert.ok(loadState(storage).error);
  assert.ok(saveState({ setItem: () => { throw new Error('QuotaExceededError'); } }, { palettes: [], selectedId: '', settings: DEFAULT_SETTINGS }));
  assert.ok(loadState({ getItem: () => { throw new Error('SecurityError'); } }).error);
  assert.equal(validateSettings({ intensity: 100, curveCount: 4, speed: NaN }).intensity, 2);
  assert.equal(validateSettings({ curveCount: 20.5 }).curveCount, 21);
});
test('image extraction preserves fixture colors and ignores transparency', () => {
  const pixels = new Uint8ClampedArray([255,0,0,255, 255,0,0,255, 0,0,255,255, 0,255,0,0]);
  assert.deepEqual(new Set(extractColors(pixels)), new Set(['#ff0000', '#0000ff']));
  assert.deepEqual(extractColors(new Uint8ClampedArray([64,64,64,255,64,64,64,255])), ['#404040']);
  assert.throws(() => extractColors(new Uint8ClampedArray([0,0,0,0])), /transparent/);
});
test('photo-sized extraction returns at most eight finite colors', () => {
  const pixels = new Uint8ClampedArray(256 * 256 * 4);
  for (let i = 0; i < pixels.length; i += 4) { pixels[i] = (i / 4) % 256; pixels[i+1] = Math.floor(i / 1024); pixels[i+2] = 80; pixels[i+3] = 255; }
  const colors = extractColors(pixels);
  assert.ok(colors.length >= 2 && colors.length <= 8);
  assert.ok(colors.every(c => /^#[0-9a-f]{6}$/.test(c)));
});
test('scheduler stops while paused, at zero intensity, and while hidden; resume does not catch up', () => {
  let scheduled: ((time: number) => void) | undefined, visible = true, active = true, speed = 1, draws = 0;
  const loop = new FrameLoop({ request: callback => { scheduled = callback; return 1; }, cancel: () => { scheduled = undefined; }, visible: () => visible }, () => active, () => speed, () => draws++);
  const frame = (time: number) => { const callback = scheduled; scheduled = undefined; callback?.(time); };
  loop.invalidate(); frame(0); frame(16); assert.equal(draws, 2); assert.equal(loop.time, .016);
  active = false; frame(32); assert.equal(scheduled, undefined);
  loop.invalidate(); frame(500); assert.equal(scheduled, undefined); assert.equal(loop.time, .016);
  active = true; loop.invalidate(); frame(600); assert.equal(loop.time, .016);
  visible = false; loop.visibilityChanged(); assert.equal(scheduled, undefined);
  visible = true; loop.visibilityChanged(); frame(90000); assert.equal(loop.time, .016);
  speed = 2; frame(90016); assert.equal(loop.time, .048);
  loop.destroy(); assert.equal(scheduled, undefined);
});
