export interface SceneSettings {
  intensity: number;
  speed: number;
  curveCount: number;
  curvature: number;
  strokeWidth: number;
  strokeOpacity: number;
  fillOpacity: number;
  seed: number;
  paused: boolean;
}

export interface Palette {
  id: string;
  name: string;
  mode: 'classic' | 'multi';
  background: [string, string];
  strokes: string[];
  fills: string[];
  builtin?: boolean;
}

export interface Renderer {
  resize(width: number, height: number, pixelRatio: number): void;
  setPalette(palette: Palette): void;
  render(points: Float32Array, settings: SceneSettings): void;
  destroy(): void;
}

export const DEFAULT_SETTINGS: SceneSettings = {
  intensity: 1, speed: 1, curveCount: 60, curvature: 1,
  strokeWidth: 2, strokeOpacity: 0.5, fillOpacity: 0.025,
  seed: 417, paused: false,
};
