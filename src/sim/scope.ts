/**
 * Oscilloscope capture and display. The engine pushes one sample per solver step into a
 * ring buffer; `scopeView` finds a trigger point and builds what the screen shows.
 */

export class ScopeBuf {
  private readonly t: Float64Array;
  private readonly a: Float32Array;
  private readonly b: Float32Array;
  private head = 0;
  count = 0;

  constructor(readonly size = 65_536) {
    this.t = new Float64Array(size);
    this.a = new Float32Array(size);
    this.b = new Float32Array(size);
  }

  push(t: number, a: number, b: number) {
    this.t[this.head] = t;
    this.a[this.head] = a;
    this.b[this.head] = b;
    this.head = (this.head + 1) % this.size;
    if (this.count < this.size) this.count++;
  }

  /** Index 0 is the oldest sample. */
  private at(i: number) {
    return (this.head - this.count + i + this.size * 2) % this.size;
  }
  time(i: number) { return this.t[this.at(i)]; }
  ch1(i: number) { return this.a[this.at(i)]; }
  ch2(i: number) { return this.b[this.at(i)]; }

  /** First index whose time is >= `t`, by binary search. */
  lowerBound(t: number): number {
    let lo = 0, hi = this.count;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.time(mid) < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}

export interface ScopeStats {
  vpp: number;
  mean: number;
  /** Hertz, when the signal has at least two rising edges on screen. */
  freq?: number;
  /** Fraction of each period spent high, 0..1. */
  duty?: number;
}

export interface ScopeView {
  /** Seconds from the left edge of the screen. */
  t: number[];
  ch1: number[];
  ch2: number[];
  /** A real trigger edge was found; otherwise the screen is free-running. */
  triggered: boolean;
  stats1: ScopeStats;
  stats2: ScopeStats;
}

const MAX_POINTS = 900;
const empty = (): ScopeStats => ({ vpp: 0, mean: 0 });

/** Measure one channel over the visible window. */
export function measure(t: number[], v: number[]): ScopeStats {
  if (!v.length) return empty();
  let lo = Infinity, hi = -Infinity, sum = 0;
  for (const x of v) {
    if (x < lo) lo = x;
    if (x > hi) hi = x;
    sum += x;
  }
  const stats: ScopeStats = { vpp: hi - lo, mean: sum / v.length };
  if (hi - lo < 0.2) return stats;
  const mid = (hi + lo) / 2;
  const rises: number[] = [];
  const falls: number[] = [];
  for (let i = 1; i < v.length; i++) {
    const cross = (a: number, b: number) => t[i - 1] + ((mid - a) / (b - a)) * (t[i] - t[i - 1]);
    if (v[i - 1] < mid && v[i] >= mid) rises.push(cross(v[i - 1], v[i]));
    else if (v[i - 1] >= mid && v[i] < mid) falls.push(cross(v[i - 1], v[i]));
  }
  if (rises.length >= 2) {
    const period = (rises[rises.length - 1] - rises[0]) / (rises.length - 1);
    stats.freq = 1 / period;
    // Duty: time above the midline between the first rise and the last rise.
    let high = 0;
    for (let k = 0; k < rises.length - 1; k++) {
      const fall = falls.find((f) => f > rises[k]);
      if (fall !== undefined && fall < rises[k + 1]) high += fall - rises[k];
    }
    stats.duty = Math.min(1, Math.max(0, high / (rises[rises.length - 1] - rises[0])));
  }
  return stats;
}

/**
 * @param tdiv seconds per horizontal division (the screen is 10 divisions wide)
 * @param trig trigger level in volts, rising edge on channel 1
 */
export function scopeView(buf: ScopeBuf, tdiv: number, trig: number): ScopeView {
  const view: ScopeView = { t: [], ch1: [], ch2: [], triggered: false, stats1: empty(), stats2: empty() };
  if (buf.count < 4) return view;
  const window = 10 * tdiv;
  const tEnd = buf.time(buf.count - 1);
  const lead = tdiv; // trigger sits one division in from the left, so the edge itself is visible
  const oldest = buf.time(0);

  // Latest rising edge through the trigger level with a full screen of data after it.
  let start = tEnd - window;
  let triggered = false;
  const newestOk = buf.lowerBound(tEnd - (window - lead));
  for (let i = Math.min(newestOk, buf.count - 1); i >= 1; i--) {
    if (buf.time(i) - lead < oldest) break;
    const a = buf.ch1(i - 1), b = buf.ch1(i);
    if (a < trig && b >= trig) {
      const tc = buf.time(i - 1) + ((trig - a) / (b - a)) * (buf.time(i) - buf.time(i - 1));
      start = tc - lead;
      triggered = true;
      break;
    }
  }
  if (start < oldest) start = oldest;
  view.triggered = triggered;

  const i0 = Math.max(0, buf.lowerBound(start) - 1);
  const i1 = Math.min(buf.count - 1, buf.lowerBound(start + window) + 1);
  const n = i1 - i0 + 1;
  const stride = Math.max(1, Math.ceil(n / (MAX_POINTS / 2)));
  for (let i = i0; i <= i1; i += stride) {
    // Keep the extremes of each bucket so narrow spikes survive thinning.
    let lo1 = Infinity, hi1 = -Infinity, lo2 = Infinity, hi2 = -Infinity, tl = 0, th = 0, tlo2 = 0, thi2 = 0;
    for (let k = i; k < Math.min(i + stride, i1 + 1); k++) {
      const a = buf.ch1(k), b = buf.ch2(k), tk = buf.time(k);
      if (a < lo1) { lo1 = a; tl = tk; }
      if (a > hi1) { hi1 = a; th = tk; }
      if (b < lo2) { lo2 = b; tlo2 = tk; }
      if (b > hi2) { hi2 = b; thi2 = tk; }
    }
    if (stride === 1) {
      view.t.push(buf.time(i) - start);
      view.ch1.push(lo1);
      view.ch2.push(lo2);
    } else {
      // Emit the bucket's low and high, in time order of channel 1.
      const first = tl <= th ? [tl, lo1, lo2] : [th, hi1, hi2];
      const second = tl <= th ? [th, hi1, hi2] : [tl, lo1, lo2];
      void tlo2; void thi2;
      view.t.push(first[0] - start, second[0] - start);
      view.ch1.push(first[1], second[1]);
      view.ch2.push(first[2], second[2]);
    }
  }
  view.stats1 = measure(view.t, view.ch1);
  view.stats2 = measure(view.t, view.ch2);
  return view;
}
