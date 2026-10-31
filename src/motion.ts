// Each point owns an independent random stream, making motion reproducible
// regardless of frame rate. Only ten points change; curves live on the GPU.
function random(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Motion {
  readonly points = new Float32Array(20);
  private tracks: { next: () => number; from: number[]; to: number[]; start: number; duration: number }[];

  constructor(seed: number) {
    this.tracks = Array.from({ length: 10 }, (_, i) => {
      const next = random(seed + i * 104729);
      const x = (i % 5) / 4 * 1.16 - 0.08;
      const position = () => [x + (next() - 0.5) * 0.12, next() * 2 - 0.5];
      return { next, from: position(), to: position(), start: 0, duration: 2 + next() * 3 };
    });
  }

  sample(time: number, intensity: number): Float32Array {
    this.tracks.forEach((track, i) => {
      // Resetting time is handled by constructing a fresh Motion on regenerate.
      while (time > track.start + track.duration) {
        track.start += track.duration;
        track.from = track.to;
        const x = (i % 5) / 4 * 1.16 - 0.08;
        track.to = [x + (track.next() - 0.5) * 0.12, track.next() * 2 - 0.5];
        track.duration = 2 + track.next() * 3;
      }
      const t = Math.max(0, Math.min(1, (time - track.start) / track.duration));
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      for (let axis = 0; axis < 2; axis++) {
        const base = axis === 0 ? (i % 5) / 4 * 1.16 - 0.08 : 0.5;
        const value = track.from[axis] + (track.to[axis] - track.from[axis]) * ease;
        this.points[i * 2 + axis] = base + (value - base) * intensity;
      }
    });
    return this.points;
  }
}
