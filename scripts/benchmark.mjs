import { chromium } from '@playwright/test';
import os from 'node:os';

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const results = { environment: { platform: os.platform(), release: os.release(), cpu: os.cpus()[0].model, memoryGB: Math.round(os.totalmem() / 2 ** 30), viewport: '1920x1080 @ 1x' }, measurements: [] };
try {
  for (const url of process.argv.slice(2)) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    await page.goto(url); await page.waitForTimeout(1500);
    const measurement = await page.evaluate(async () => {
      const canvas = document.querySelector('canvas');
      const gl = canvas?.getContext('webgl2');
      const debug = gl?.getExtension('WEBGL_debug_renderer_info');
      const renderer = gl && debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'Canvas2D';
      const intervals = []; let previous;
      await new Promise(resolve => {
        const start = performance.now();
        function frame(now) {
          if (previous !== undefined) intervals.push(now - previous);
          previous = now;
          if (now - start < 5000) requestAnimationFrame(frame); else resolve();
        }
        requestAnimationFrame(frame);
      });
      const sorted = [...intervals].sort((a, b) => a - b);
      return { renderer, samples: intervals.length, fps: +(1000 / (intervals.reduce((a, b) => a + b, 0) / intervals.length)).toFixed(1), p95FrameMs: +sorted[Math.floor(sorted.length * .95)].toFixed(2), renderingMessage: document.querySelector('#renderer-status')?.textContent ?? '' };
    });
    results.measurements.push({ url, ...measurement }); await context.close();
  }
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
