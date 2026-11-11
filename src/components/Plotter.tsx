"use client";

import { useMemo } from "react";
import { useStore } from "@/store";

const COLORS = ["#0d7480", "#c2410c", "#6d28d9", "#15803d", "#b91c1c", "#a16207"];
const W = 760;
const H = 200;
const POINTS = 400;

interface Series {
  name: string;
  values: number[];
}

/**
 * Turn the serial text into lines of numbers. A line holds numbers split by spaces, commas
 * or tabs; "name:value" labels a series, as the Arduino IDE's plotter does.
 */
export function parseSeries(text: string): Series[] {
  const series: Series[] = [];
  const byName = new Map<string, Series>();
  for (const line of text.split(/\r?\n/).slice(0, -1)) {
    const tokens = line.trim().split(/[\s,\t]+/).filter(Boolean);
    let index = 0;
    let any = false;
    for (const tok of tokens) {
      const m = /^(?:([A-Za-z_][\w ]*):)?(-?\d*\.?\d+(?:[eE][-+]?\d+)?)$/.exec(tok);
      if (!m) continue;
      const name = m[1] ?? `value ${index + 1}`;
      index++;
      let s = byName.get(name);
      if (!s) {
        s = { name, values: [] };
        byName.set(name, s);
        series.push(s);
      }
      s.values.push(Number(m[2]));
      any = true;
    }
    if (!any) continue;
  }
  return series.slice(0, COLORS.length);
}

/** A tidy step for axis labels. */
function niceStep(span: number): number {
  const raw = span / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  return (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
}

export default function Plotter() {
  const serial = useStore((s) => s.serial);
  const running = useStore((s) => s.running);
  const series = useMemo(() => parseSeries(serial), [serial]);

  if (!series.length) {
    return (
      <div className="plotter-empty">
        <p>
          {running ? "Waiting for numbers." : "Run a sketch that prints numbers to see them graphed."} Print one or more values per line with
          Serial.println(), for example <code>Serial.println(analogRead(A0));</code>
        </p>
        <p className="muted">Label a series with a name and a colon: <code>Serial.print(&quot;light:&quot;);</code> then the value.</p>
      </div>
    );
  }

  const recent = series.map((s) => ({ ...s, values: s.values.slice(-POINTS) }));
  const all = recent.flatMap((s) => s.values);
  let lo = Math.min(...all), hi = Math.max(...all);
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.08;
  lo -= pad;
  hi += pad;
  const step = niceStep(hi - lo);
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(+t.toFixed(10));
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  const longest = Math.max(...recent.map((s) => s.values.length));
  // The graph fills left to right, then scrolls once it holds POINTS samples.
  const x = (i: number) => (i / (Math.max(longest, 20) - 1)) * W;

  return (
    <div className="plotter">
      <div className="plotter-legend">
        {recent.map((s, k) => (
          <span key={s.name}>
            <i style={{ background: COLORS[k] }} />
            {s.name}
            <b>{s.values[s.values.length - 1]}</b>
          </span>
        ))}
      </div>
      <svg viewBox={`-44 -8 ${W + 52} ${H + 20}`} role="img" aria-label="Plot of the numbers the sketch prints" preserveAspectRatio="none">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={0} x2={W} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <text x={-6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--ink-3)" fontFamily="var(--font-mono)">{t}</text>
          </g>
        ))}
        {recent.map((s, k) => (
          <polyline
            key={s.name}
            fill="none"
            stroke={COLORS[k]}
            strokeWidth={2}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            points={s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}
          />
        ))}
      </svg>
    </div>
  );
}
