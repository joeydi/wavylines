# Wavy Lines

A browser-local playground for flowing curves, color, and motion. Built with TypeScript, Vite, WebGL2, and DialKit’s framework-free adapter. No accounts, uploads, external fonts, or runtime CDN requests.

## Run

```sh
npm ci
npm run dev
```

`npm run build` type-checks the app and produces `dist/`. Serve that directory with any static HTTPS host. `npm run preview` serves the production build locally. The app uses root-relative asset URLs; for a subdirectory deployment, set Vite’s `base` to the deployment path.

## Use

- **Motion** scales point displacement from 0–200%. **Pause** freezes the current composition. Reduced-motion preferences start playback paused.
- **Tweaks** exposes speed, geometry, opacity, and composition regeneration through DialKit. Tuning versions live in the panel and are separate from color palettes. The last-used scene settings are saved locally; DialKit versions are session-only.
- **Palettes** contains classic four-role palettes and multi-color palettes. Multi-color stroke and fill lists blend across the layers in OKLab. Edit a built-in to create a custom copy, or edit/rename an existing custom palette. “Apply without saving” lasts for the current visit.
- Drop a JPEG, PNG, or WebP anywhere, or use **From an image**. Images stay on your device. Up to 10 MB and 48 megapixels are accepted; a maximum 256px sample is quantized in a worker and then discarded. Preview, edit, save, or cancel back to the previous colors.
- **Export JSON** backs up saved custom palettes. Import adds palettes to the library, preserving existing entries. Storage errors leave the current edits in memory so they can still be exported. Browser storage belongs to the page’s origin; different hosts/ports have separate libraries.

## Architecture

`src/renderer.ts` owns WebGL resources. Reusable parameter geometry evaluates two five-point cubic splines and their intermediate curves on the GPU. Triangle ribbons supply portable stroke widths; winding stencils preserve concave and self-intersecting translucent fills in layer order. Color lookup tables are prepared only when the palette changes. Rendering pixel ratio is capped at 2.

`src/motion.ts` uses seeded, independent point tracks and eased 2–5 second targets. `src/animation.ts` schedules frames only while playback is active, visible, and intensity is nonzero. Hidden-tab and paused time does not accumulate. Controls invalidate one frame when stationary.

`src/store.ts` coordinates controls, settings, and palette selection. `src/storage.ts` validates version 1 JSON backups and recovers from browser storage failures. `src/extraction.ts` implements deterministic weighted median-cut extraction; `src/palette.worker.ts` runs it off the UI thread. `src/ui.ts` owns the native DOM palette workflow, and `src/tweaks.ts` connects DialKit to the same scene settings.

WebGL2 failure leaves the palette library and gradient usable. Context restoration recreates GPU resources and redraws with the current settings.

## Validation

```sh
npm test
npx playwright install chromium firefox webkit
npm run test:e2e
npm run build
```

Core tests cover deterministic motion, displacement, the frame scheduler, perceptual interpolation, palette serialization, storage failure, and image fixtures. Browser tests exercise saving/reloading, import/export, duplication/deletion, image preview/cancel/save, context recovery, stationary rendering, keyboard dialogs, reduced motion, and responsive layouts.

The Playwright projects cover Chromium, Firefox, WebKit, and mobile Chromium/WebKit emulation. Emulation is not a substitute for testing physical iOS/Android devices. See `VALIDATION.md` for results and remaining verification limits.

To run browser checks against an already-serving production build:

```sh
npm run preview -- --port 4173
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npm run test:e2e
```

For a recorded 1080p frame-cadence comparison, run `node scripts/benchmark.mjs <original-url> <rewrite-url>` with no other animated previews running.
