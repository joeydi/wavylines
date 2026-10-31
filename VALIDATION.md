# Verification — October 31, 2026

## Results

- `npm test`: 9 passing core tests.
- `npm run test:e2e`: 45 passing checks across desktop Chromium, Firefox, WebKit, Pixel 7 Chromium emulation, and iPhone 15 WebKit emulation (9 scenarios per project).
- Production smoke checks: 3 passing WebKit scenarios against `npm run preview`: image preview/cancel/save, actual drag-and-drop with no external requests, and DialKit/toolbar synchronization.
- `npm run build`: TypeScript checks and static Vite build pass.
- Production lifecycle regression checks: 5 passing checks, one per browser project, covering hidden-tab cancellation/resume, pause, zero intensity, and context restoration.
- `git diff --check`: passes.
- Visual inspection: original Canvas2D reference, WebGL2 classic and multi-color artwork, desktop palette drawer, mobile bottom sheet, and DialKit panel.

The browser scenarios cover palette creation, editing, ordering, saving and reloading; JSON export/import; duplication/deletion; image extraction and cancellation; transparent/unsupported/unreadable images; denied storage; reduced motion; keyboard dialogs and focus restoration; orientation changes; missing WebGL2; and WebGL context recovery. Draw-call instrumentation confirms no continuing GPU draw loop while paused or at zero motion intensity. The frame-loop unit test covers hidden-tab cancellation and resume without time catch-up.

The original reference came from commit `1889d60`; a copy was served separately before the rewrite. No third-party animation or DOM libraries are used by the new renderer.

## 1080p benchmark

Environment: Apple M1, 16 GB RAM, macOS/Darwin 25.6.0. Chromium with ANGLE Metal, viewport 1920 × 1080 at device pixel ratio 1. Default 60 curves, 2px strokes, 0.5 maximum stroke opacity, 0.025 fill opacity. A 1.5-second warmup preceded 5 seconds of animation-frame interval sampling per page.

| Version | Average FPS | 95th-percentile frame interval | Samples |
| --- | ---: | ---: | ---: |
| Original Canvas2D implementation | 60.0 | 16.8 ms | 300 |
| Production WebGL2 rewrite | 60.0 | 16.8 ms | 300 |

This verifies the 60fps desktop target on the tested machine. It does not demonstrate an FPS improvement over the original: both saturate the display cadence. The rewrite moves curve evaluation and rasterization to the GPU, but the benchmark does not measure GPU completion time or isolate CPU cost. Run performance comparisons with one active animation at a time; a concurrent large live preview reduced throughput in one run.

To benchmark other URLs:

```sh
node scripts/benchmark.mjs <original-url> <rewrite-url>
```

The script requests Metal for macOS. Adapt the launch options when measuring other platforms. It reports hardware, viewport, renderer, sample count, average FPS, and p95 frame interval.

## Limits

- Mobile layouts and touch-capable contexts were tested through emulation on the Mac. Physical iOS/Android devices and the 30fps mobile target still require hardware testing.
- WebKit testing is engine coverage, not a certification of every shipping Safari/iOS combination. Likewise, Chromium and Firefox tests use Playwright’s bundled browser builds.
- No deployment was requested or performed. The static `dist/` build is ready for hosting.
- Browser-local libraries are scoped to the host and port. JSON export is the backup/transfer mechanism; accounts and sync are outside this version.
