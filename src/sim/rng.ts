/** Seeded RNG (mulberry32). */
export class Rng {
  private a: number;
  constructor(seed: number) {
    this.a = seed >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    let t = (this.a = (this.a + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  uniform(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }

  /** Normal(mean, sd) via Box-Muller. */
  normal(mean = 0, sd = 1): number {
    const u = 1 - this.next(); // (0, 1]
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.next());
  }

  /** A v4-shaped uuid built from the stream (deterministic). */
  uuid(): string {
    const hex = (n: number) => Array.from({ length: n }, () => Math.floor(this.next() * 16).toString(16)).join("");
    return `${hex(8)}-${hex(4)}-4${hex(3)}-${"89ab"[Math.floor(this.next() * 4)]}${hex(3)}-${hex(12)}`;
  }
}
