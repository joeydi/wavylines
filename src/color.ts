export type RGB = [number, number, number];
export function hexToRgb(hex: string): RGB {
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) as RGB;
}
export function rgbToHex(rgb: RGB): string {
  return '#' + rgb.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
}
const linear = (c: number) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const srgb = (c: number) => c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
export function toOklab(rgb: RGB): RGB {
  const [r, g, b] = rgb.map(linear);
  const l = Math.cbrt(0.4122214708*r + 0.5363325363*g + 0.0514459929*b);
  const m = Math.cbrt(0.2119034982*r + 0.6806995451*g + 0.1073969566*b);
  const s = Math.cbrt(0.0883024619*r + 0.2817188376*g + 0.6299787005*b);
  return [0.2104542553*l + 0.793617785*m - 0.0040720468*s, 1.9779984951*l - 2.428592205*m + 0.4505937099*s, 0.0259040371*l + 0.7827717662*m - 0.808675766*s];
}
export function fromOklab([L, a, b]: RGB): RGB {
  const l = Math.pow(L + 0.3963377774*a + 0.2158037573*b, 3);
  const m = Math.pow(L - 0.1055613458*a - 0.0638541728*b, 3);
  const s = Math.pow(L - 0.0894841775*a - 1.291485548*b, 3);
  return [4.0767416621*l - 3.3077115913*m + 0.2309699292*s, -1.2684380046*l + 2.6097574011*m - 0.3413193965*s, -0.0041960863*l - 0.7034186147*m + 1.707614701*s].map(srgb) as RGB;
}
export function interpolateColors(colors: string[], t: number): RGB {
  if (colors.length === 1) return hexToRgb(colors[0]);
  const position = Math.max(0, Math.min(1, t)) * (colors.length - 1);
  const index = Math.min(Math.floor(position), colors.length - 2);
  const a = toOklab(hexToRgb(colors[index]));
  const b = toOklab(hexToRgb(colors[index + 1]));
  return fromOklab(a.map((v, i) => v + (b[i] - v) * (position - index)) as RGB).map(v => Math.max(0, Math.min(1, v))) as RGB;
}
export function colorTable(colors: string[], size = 256): Uint8Array<ArrayBuffer> {
  const data = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    const rgb = interpolateColors(colors, i / (size - 1));
    data.set([...rgb.map(v => Math.round(v * 255)), 255], i * 4);
  }
  return data;
}
