import { hexToRgb, rgbToHex, toOklab } from './color.ts';
import type { RGB } from './color.ts';
import type { Palette } from './types.ts';

interface Sample { rgb: RGB; weight: number }

// Weighted median cut on a five-bit histogram: bounded work even for photos,
// deterministic results, and no artificial extra colors for monochrome input.
export function extractColors(pixels: Uint8ClampedArray, maximum = 8): string[] {
  const histogram = new Map<number, { sums: number[]; weight: number }>();
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const key = ((pixels[i] >> 3) << 10) | ((pixels[i + 1] >> 3) << 5) | (pixels[i + 2] >> 3);
    let entry = histogram.get(key);
    if (!entry) { entry = { sums: [0, 0, 0], weight: 0 }; histogram.set(key, entry); }
    entry.weight++;
    for (let c = 0; c < 3; c++) entry.sums[c] += pixels[i + c];
  }
  if (!histogram.size) throw new Error('This image is transparent. Choose an image with visible colors.');
  const samples: Sample[] = [...histogram.values()].map(({ sums, weight }) => ({ rgb: sums.map(v => v / weight / 255) as RGB, weight }));
  const boxes = [samples];
  const ranges = (box: Sample[]) => [0, 1, 2].map(c => Math.max(...box.map(p => p.rgb[c])) - Math.min(...box.map(p => p.rgb[c])));
  while (boxes.length < maximum) {
    let index = -1, score = -1, axis = 0;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      const range = ranges(box), widest = Math.max(...range);
      const next = widest * Math.sqrt(box.reduce((sum, p) => sum + p.weight, 0));
      if (next > score) { score = next; index = i; axis = range.indexOf(widest); }
    });
    if (index === -1) break;
    const box = boxes[index].sort((a, b) => a.rgb[axis] - b.rgb[axis]);
    const total = box.reduce((sum, p) => sum + p.weight, 0);
    let split = 0, weight = 0;
    while (split < box.length - 1 && weight < total / 2) weight += box[split++].weight;
    boxes.splice(index, 1, box.slice(0, split), box.slice(split));
  }
  const colors = boxes.map(box => {
    const weight = box.reduce((sum, p) => sum + p.weight, 0);
    return rgbToHex([0, 1, 2].map(c => box.reduce((sum, p) => sum + p.rgb[c] * p.weight, 0) / weight) as RGB);
  });
  return [...new Set(colors)].sort((a, b) => toOklab(hexToRgb(b))[0] - toOklab(hexToRgb(a))[0]);
}

export function suggestedPalette(colors: string[], name: string): Palette {
  const brightest = colors[0], darkest = colors[colors.length - 1];
  const chromatic = [...colors].sort((a, b) => {
    const [, aa, ab] = toOklab(hexToRgb(a)), [, ba, bb] = toOklab(hexToRgb(b));
    return Math.hypot(ba, bb) - Math.hypot(aa, ab);
  });
  return { id: crypto.randomUUID(), name: name.replace(/\.[^.]+$/, '').slice(0, 80) || 'From an image', mode: 'classic', background: [brightest, darkest], strokes: [chromatic[0]], fills: [darkest] };
}
