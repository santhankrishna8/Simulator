"use client";

import { memo } from "react";
import { BB_COLS, BB_H, BB_W, HOLES, LED_COLORS, ROW_LETTERS, formatSI, resistorBands } from "@/sim/catalog";
import type { PartLive } from "@/sim/engine";
import { glyph } from "@/sim/lcdfont";
import { OLED_H, OLED_W, pixel } from "@/sim/ssd1306";
import type { Part } from "@/sim/model";
import { useStore } from "@/store";

/** SVG units per grid unit (0.1 inch). */
export const U = 10;

const LEAD = "#b4b8bc";
const LEAD_DARK = "#8b9095";

/** Shared gradients and filters; rendered once at the app root. */
export function GraphicsDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <defs>
        <linearGradient id="g-metal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f1f3f4" />
          <stop offset="0.45" stopColor="#c3c8cc" />
          <stop offset="1" stopColor="#8e959b" />
        </linearGradient>
        <linearGradient id="g-metal-h" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#9aa1a7" />
          <stop offset="0.3" stopColor="#eef0f1" />
          <stop offset="0.7" stopColor="#c3c8cc" />
          <stop offset="1" stopColor="#868d93" />
        </linearGradient>
        <linearGradient id="g-shade-v" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.38" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.28" />
        </linearGradient>
        <linearGradient id="g-shade-h" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.3" />
          <stop offset="0.25" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.34" />
        </linearGradient>
        <radialGradient id="g-dome" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="0.4" stopColor="#fff" stopOpacity="0.08" />
          <stop offset="1" stopColor="#000" stopOpacity="0.25" />
        </radialGradient>
        {Object.entries(LED_COLORS).map(([key, spec]) => (
          <radialGradient key={key} id={`g-glow-${key}`}>
            <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
            <stop offset="0.22" stopColor={spec.lit} stopOpacity="0.75" />
            <stop offset="0.6" stopColor={spec.lit} stopOpacity="0.22" />
            <stop offset="1" stopColor={spec.lit} stopOpacity="0" />
          </radialGradient>
        ))}
        <radialGradient id="g-disc" cx="0.38" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#4a4e53" />
          <stop offset="1" stopColor="#141618" />
        </radialGradient>
      </defs>
    </svg>
  );
}

/* ---------- Breadboard ---------- */

export const Breadboard = memo(function Breadboard() {
  const w = BB_W * U;
  const h = BB_H * U;
  const nums = [1, 5, 10, 15, 20, 25, 30];
  return (
    <g>
      <rect x={0} y={0} width={w} height={h} rx={5} fill="#efede6" stroke="#d2cfc4" strokeWidth={0.8} />
      <rect x={1} y={1} width={w - 2} height={h - 2} rx={4} fill="none" stroke="#fff" strokeOpacity={0.7} strokeWidth={0.8} />
      {/* centre trench */}
      <rect x={4} y={9.5 * U - 4} width={w - 8} height={8} rx={2} fill="#dcd9cf" />
      <rect x={4} y={9.5 * U - 4} width={w - 8} height={1.2} fill="#c3c0b4" />
      {/* power rail guide lines */}
      {[0.45, 16.45].map((y) => (
        <line key={y} x1={U * 0.7} x2={w - U * 0.7} y1={y * U} y2={y * U} stroke="#d63a2f" strokeWidth={0.9} />
      ))}
      {[2.55, 18.55].map((y) => (
        <line key={y} x1={U * 0.7} x2={w - U * 0.7} y1={y * U} y2={y * U} stroke="#2f6fd6" strokeWidth={0.9} />
      ))}
      {[1, 17].map((y) => (
        <g key={y} fontSize={5} fontWeight={600} textAnchor="middle" fontFamily="var(--font-mono)">
          <text x={3.2} y={y * U + 1.8} fill="#d63a2f">+</text>
          <text x={3.2} y={(y + 1) * U + 1.8} fill="#2f6fd6">−</text>
          <text x={w - 3.2} y={y * U + 1.8} fill="#d63a2f">+</text>
          <text x={w - 3.2} y={(y + 1) * U + 1.8} fill="#2f6fd6">−</text>
        </g>
      ))}
      <g fontSize={3.6} fill="#9a968a" textAnchor="middle" fontFamily="var(--font-mono)">
        {nums.map((n) => (
          <g key={n}>
            <text x={n * U} y={3 * U + 1.3}>{n}</text>
            <text x={n * U} y={16 * U + 1.3}>{n}</text>
          </g>
        ))}
        {Object.entries(ROW_LETTERS).map(([y, letter]) => (
          <g key={y}>
            <text x={3.4} y={Number(y) * U + 1.3}>{letter}</text>
            <text x={(BB_COLS + 1) * U - 3.4} y={Number(y) * U + 1.3}>{letter}</text>
          </g>
        ))}
      </g>
      {HOLES.map((hole) => (
        <g key={hole.id}>
          <rect x={hole.x * U - 2.1} y={hole.y * U - 2.1} width={4.2} height={4.2} rx={0.9} fill="#d9d6cb" />
          <rect x={hole.x * U - 1.5} y={hole.y * U - 1.5} width={3} height={3} rx={0.5} fill="#2b2c2e" />
        </g>
      ))}
    </g>
  );
});

/* ---------- Leads and helpers ---------- */

function Lead({ d }: { d: string }) {
  return (
    <>
      <path d={d} fill="none" stroke={LEAD_DARK} strokeWidth={1.7} strokeLinecap="round" />
      <path d={d} fill="none" stroke={LEAD} strokeWidth={1} strokeLinecap="round" />
    </>
  );
}

/** Flexible insulated lead from a device to its wiring pin. */
function FlyLead({ d, color }: { d: string; color: string }) {
  return (
    <>
      <path d={d} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={3.6} strokeLinecap="round" />
      <path d={d} fill="none" stroke={color} strokeWidth={2.8} strokeLinecap="round" />
      <path d={d} fill="none" stroke="#fff" strokeOpacity={0.22} strokeWidth={0.8} strokeLinecap="round" transform="translate(-0.5,-0.5)" />
    </>
  );
}

function PinTip({ x, y }: { x: number; y: number }) {
  return (
    <>
      <circle cx={x} cy={y} r={2.4} fill="#6f757b" />
      <circle cx={x} cy={y} r={1.6} fill="url(#g-metal)" />
    </>
  );
}

/* ---------- Passive parts ---------- */

function Resistor({ part, live }: GProps) {
  const bands = resistorBands(Number(part.props.ohms));
  const burned = live?.burned;
  const hot = !burned && (live?.p ?? 0) > 0.25;
  const body = "M11 0 C11 -4.6 15 -4.2 17 -3.3 L23 -3.3 C25 -4.2 29 -4.6 29 0 C29 4.6 25 4.2 23 3.3 L17 3.3 C15 4.2 11 4.6 11 0 Z";
  return (
    <g>
      <Lead d="M0 0 H40" />
      <path d={body} fill={burned ? "#2a211b" : "#dcc7a1"} />
      {!burned &&
        [13.4, 17.4, 20.6, 25.4].map((x, i) => (
          <rect key={i} x={x} y={i === 0 || i === 3 ? -4 : -3.3} width={1.9} height={i === 0 || i === 3 ? 8 : 6.6} fill={bands[i]} clipPath="none" />
        ))}
      <path d={body} fill="url(#g-shade-v)" />
      {hot && <path d={body} fill="#ff5a1f" opacity={0.45} className="pulse" />}
      {burned && <path d="M15 -3 l3 2 l-2 2 l4 2" stroke="#6b5a4c" strokeWidth={0.6} fill="none" />}
    </g>
  );
}

function Diode() {
  return (
    <g>
      <Lead d="M0 0 H40" />
      <rect x={11.5} y={-3.6} width={17} height={7.2} rx={1.6} fill="#1c1d1f" />
      <rect x={24} y={-3.6} width={2.6} height={7.2} fill="#c9cdd1" />
      <rect x={11.5} y={-3.6} width={17} height={7.2} rx={1.6} fill="url(#g-shade-v)" />
    </g>
  );
}

function Led({ part, live }: GProps) {
  const spec = LED_COLORS[String(part.props.color)] ?? LED_COLORS.red;
  const burned = live?.burned;
  const glow = burned ? 0 : (live?.glow ?? 0);
  const dome = "M-5 -17 V-34 A10 10 0 0 1 15 -34 V-17 Z";
  return (
    <g>
      <Lead d="M0 0 V-16" />
      <Lead d="M10 0 V-16" />
      <text x={-4.6} y={-4} fontSize={5} fontWeight={600} fill="#6b7175" textAnchor="middle" fontFamily="var(--font-mono)">+</text>
      {glow > 0.02 && (
        <circle cx={5} cy={-32} r={16 + glow * 26} fill={`url(#g-glow-${LED_COLORS[String(part.props.color)] ? part.props.color : "red"})`} opacity={Math.min(1, 0.25 + glow * 0.75)} />
      )}
      <rect x={-6.4} y={-19.4} width={22.8} height={3.4} rx={1.2} fill={burned ? "#3a3a3a" : spec.body} />
      <path d="M15 -19.4 h1.4 v3.4 h-1.4 z" fill="#000" opacity={0.25} />
      <path d={dome} fill={burned ? "#4a4744" : spec.body} opacity={burned ? 1 : 0.86} />
      {/* internal anvil and post */}
      <path d="M0 -17 V-27 h3 M10 -17 V-30 h-5 v3" fill="none" stroke="#000" strokeOpacity={0.28} strokeWidth={1.3} />
      {glow > 0.02 && <path d={dome} fill={spec.lit} opacity={glow * 0.9} />}
      {glow > 0.3 && <ellipse cx={5} cy={-30} rx={5 * glow} ry={6 * glow} fill="#fff" opacity={glow * 0.8} />}
      <path d={dome} fill="url(#g-dome)" />
      {burned && <path d="M0 -40 l3 6 l-3 4 l5 5 M9 -36 l-2 5" stroke="#1d1b19" strokeWidth={0.8} fill="none" />}
    </g>
  );
}

function Capacitor({ part }: GProps) {
  return (
    <g>
      <Lead d="M0 0 V-12" />
      <Lead d="M10 0 V-12" />
      <rect x={-6} y={-56} width={22} height={44} rx={3} fill="#1d2b4f" />
      <rect x={9.5} y={-55} width={5} height={42} fill="#cfd6e4" opacity={0.92} />
      {[-46, -34, -22].map((y) => (
        <rect key={y} x={10.8} y={y} width={2.4} height={0.9} fill="#1d2b4f" />
      ))}
      <rect x={-6} y={-56} width={22} height={3} rx={1.5} fill="#aeb4ba" />
      <rect x={-6} y={-56} width={22} height={44} rx={3} fill="url(#g-shade-h)" />
      <text x={2} y={-22} fontSize={4.2} fill="#dfe6f5" fontFamily="var(--font-mono)" transform="rotate(-90 2 -22)">
        {formatSI(Number(part.props.farads), "F", 2).replace(" ", "")}
      </text>
    </g>
  );
}

function Ldr() {
  return (
    <g>
      <Lead d="M0 0 V-22" />
      <Lead d="M10 0 V-22" />
      <circle cx={5} cy={-32} r={11.5} fill="#b9772a" />
      <circle cx={5} cy={-32} r={10} fill="#e4b062" />
      <path d="M-2 -38 h14 M12 -38 v3 h-14 v3 h14 v3 h-14 v3 h14" fill="none" stroke="#8c3b1f" strokeWidth={1.1} />
      <circle cx={5} cy={-32} r={11.5} fill="url(#g-dome)" />
    </g>
  );
}

/* ---------- Inputs ---------- */

function Button({ part }: GProps) {
  const pressed = useStore((s) => s.pressed.has(part.id));
  const set = useStore((s) => s.setPressed);
  return (
    <g>
      {[0, 20].map((x) =>
        [0, 30].map((y) => <rect key={`${x}${y}`} x={x - 1.4} y={y === 0 ? 0 : 24} width={2.8} height={6} rx={0.6} fill="url(#g-metal-h)" />),
      )}
      <rect x={-2.5} y={2.5} width={25} height={25} rx={2.2} fill="#26282b" />
      <rect x={-0.6} y={4.4} width={21.2} height={21.2} rx={1.4} fill="url(#g-metal)" />
      {[
        [1.6, 6.6], [18.4, 6.6], [1.6, 23.4], [18.4, 23.4],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={1.1} fill="#1b1c1e" />
      ))}
      <g
        className="hit-control"
        role="button"
        aria-label="Push button"
        onPointerDown={(e) => {
          e.stopPropagation();
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          set(part.id, true);
        }}
        onPointerUp={() => set(part.id, false)}
        onPointerCancel={() => set(part.id, false)}
      >
        <circle cx={10} cy={15} r={7.6} fill="#0f1011" />
        <circle cx={10} cy={pressed ? 15 : 14.3} r={pressed ? 6.2 : 6.8} fill={pressed ? "#2c2f33" : "#3b3f44"} />
        <circle cx={10} cy={pressed ? 15 : 14.3} r={pressed ? 6.2 : 6.8} fill="url(#g-dome)" opacity={pressed ? 0.4 : 1} />
      </g>
    </g>
  );
}

function Switch({ part }: GProps) {
  const on = Number(part.props.pos) === 1;
  const setProp = useStore((s) => s.setProp);
  return (
    <g>
      {[0, 10, 20].map((x) => (
        <Lead key={x} d={`M${x} 0 V-8`} />
      ))}
      <rect x={-9} y={-27} width={38} height={20} rx={1.6} fill="url(#g-metal)" stroke="#7d848a" strokeWidth={0.6} />
      <rect x={-3} y={-21.5} width={26} height={9} rx={1} fill="#17181a" />
      <g
        className="hit-control"
        role="switch"
        aria-checked={on}
        aria-label="Slide switch"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setProp(part.id, "pos", on ? 0 : 1)}
      >
        <rect x={-9} y={-34} width={38} height={27} fill="transparent" />
        <rect x={on ? 10.5 : -1.5} y={-33.5} width={11} height={20} rx={1.2} fill="#2c2f33" style={{ transition: "x 90ms ease-out" }} />
        <rect x={on ? 10.5 : -1.5} y={-33.5} width={11} height={20} rx={1.2} fill="url(#g-shade-h)" style={{ transition: "x 90ms ease-out" }} />
      </g>
    </g>
  );
}

function Pot({ part }: GProps) {
  const t = Number(part.props.t);
  const angle = -135 + t * 270;
  return (
    <g>
      {[0, 10, 20].map((x) => (
        <Lead key={x} d={`M${x} 0 V-12`} />
      ))}
      <rect x={-9} y={-50} width={38} height={38} rx={3} fill="#2a63b8" />
      <rect x={-9} y={-50} width={38} height={38} rx={3} fill="url(#g-shade-v)" />
      <circle cx={10} cy={-31} r={14.5} fill="#1a3f78" />
      <g transform={`rotate(${angle} 10 -31)`}>
        <circle cx={10} cy={-31} r={12.5} fill="#f1efe9" />
        <circle cx={10} cy={-31} r={12.5} fill="url(#g-dome)" />
        <rect x={8.9} y={-42.5} width={2.2} height={12} rx={1} fill="#2b2d30" />
      </g>
      <text x={10} y={-13.6} fontSize={3.6} textAnchor="middle" fill="#dbe7fb" fontFamily="var(--font-mono)">
        {formatSI(Number(part.props.ohms), "Ω", 2).replace(" ", "")}
      </text>
    </g>
  );
}

/* ---------- Outputs ---------- */

function Buzzer({ live }: GProps) {
  return (
    <g>
      {live?.sounding &&
        [0, 1, 2].map((i) => (
          <circle key={i} cx={15} cy={0} r={24} fill="none" stroke="#0d7480" strokeWidth={1.2} className="ring" style={{ animationDelay: `${i * 0.3}s` }} />
        ))}
      <circle cx={15} cy={0.8} r={24} fill="#000" opacity={0.25} />
      <circle cx={15} cy={0} r={24} fill="url(#g-disc)" />
      <circle cx={15} cy={0} r={20.5} fill="none" stroke="#000" strokeOpacity={0.35} strokeWidth={0.8} />
      <circle cx={15} cy={0} r={3.4} fill="#050506" />
      <text x={-1} y={-10} fontSize={7} fontWeight={600} fill="#d5d9dc" textAnchor="middle" fontFamily="var(--font-mono)">+</text>
      <PinTip x={0} y={0} />
      <PinTip x={30} y={0} />
    </g>
  );
}

function Motor({ live }: GProps) {
  const deg = ((live?.angle ?? 0.5) * 180) / Math.PI;
  const rpm = Math.abs(live?.rpm ?? 0);
  const blur = Math.min(1, rpm / 2500);
  return (
    <g>
      <FlyLead d="M2 -32 C2 -18 0 -12 0 0" color="#d63a2f" />
      <FlyLead d="M18 -32 C18 -18 20 -12 20 0" color="#1d1f22" />
      <PinTip x={0} y={0} />
      <PinTip x={20} y={0} />
      {/* can, seen from the shaft end */}
      <rect x={-22} y={-106} width={64} height={72} rx={22} fill="url(#g-metal-h)" stroke="#767d83" strokeWidth={0.7} />
      <rect x={-13} y={-97} width={46} height={54} rx={16} fill="#e9ecee" opacity={0.5} />
      <rect x={-6} y={-40} width={32} height={9} rx={2} fill="#f4f1e8" stroke="#bdb9ad" strokeWidth={0.5} />
      <circle cx={10} cy={-70} r={9} fill="#c98b3a" />
      {/* propeller */}
      <g transform={`rotate(${deg} 10 -70)`}>
        {blur > 0.25 && <circle cx={10} cy={-70} r={50} fill="#0d7480" opacity={0.1 + blur * 0.12} />}
        <g opacity={1 - blur * 0.75}>
          {[0, 120, 240].map((a) => (
            <path key={a} transform={`rotate(${a} 10 -70)`} d="M10 -70 C2 -84 0 -104 9 -120 C18 -110 20 -88 10 -70 Z" fill="#0d7480" />
          ))}
        </g>
        <circle cx={10} cy={-70} r={5.5} fill="#f1f3f4" stroke="#7d848a" strokeWidth={0.6} />
        <circle cx={10} cy={-70} r={1.6} fill="#7d848a" />
      </g>
    </g>
  );
}

/* ---------- Power ---------- */

function Battery9V() {
  return (
    <g>
      <FlyLead d="M-10 -34 C-10 -18 0 -16 0 0" color="#d63a2f" />
      <FlyLead d="M30 -34 C30 -18 20 -16 20 0" color="#1d1f22" />
      <PinTip x={0} y={0} />
      <PinTip x={20} y={0} />
      <rect x={-45} y={-238} width={110} height={190} rx={5} fill="#22272b" />
      <rect x={-45} y={-238} width={110} height={74} rx={5} fill="#0d7480" />
      <rect x={-45} y={-172} width={110} height={8} fill="#0a5c66" />
      <text x={10} y={-190} fontSize={34} fontWeight={600} textAnchor="middle" fill="#f4f7f8" letterSpacing={-1}>9V</text>
      <text x={10} y={-120} fontSize={7.5} textAnchor="middle" fill="#aeb6bb" fontFamily="var(--font-mono)" letterSpacing={1.2}>ALKALINE</text>
      <text x={10} y={-106} fontSize={6} textAnchor="middle" fill="#7f888e" fontFamily="var(--font-mono)">6LR61 · 550 mAh</text>
      <text x={-22} y={-66} fontSize={12} fontWeight={600} textAnchor="middle" fill="#e9605a">+</text>
      <text x={42} y={-66} fontSize={12} fontWeight={600} textAnchor="middle" fill="#aeb6bb">−</text>
      <rect x={-45} y={-238} width={110} height={190} rx={5} fill="url(#g-shade-h)" opacity={0.7} />
      {/* snap connector */}
      <rect x={-38} y={-54} width={96} height={22} rx={4} fill="#111315" />
      <circle cx={-12} cy={-43} r={7} fill="#2a2d30" />
      <circle cx={32} cy={-43} r={7} fill="#2a2d30" />
      <circle cx={-12} cy={-43} r={3.6} fill="url(#g-metal)" />
      <circle cx={32} cy={-43} r={3.6} fill="url(#g-metal)" />
    </g>
  );
}

function AAHolder({ cells }: { cells: number }) {
  const w = cells * 62 + 6;
  const x0 = 10 - w / 2;
  return (
    <g>
      <FlyLead d={`M${x0 + 14} -34 C${x0 + 14} -14 0 -18 0 0`} color="#d63a2f" />
      <FlyLead d={`M${x0 + w - 14} -34 C${x0 + w - 14} -14 20 -18 20 0`} color="#1d1f22" />
      <PinTip x={0} y={0} />
      <PinTip x={20} y={0} />
      <rect x={x0} y={-258} width={w} height={226} rx={6} fill="#17191b" />
      <rect x={x0 + 2} y={-256} width={w - 4} height={222} rx={5} fill="none" stroke="#33373b" strokeWidth={1} />
      {Array.from({ length: cells }, (_, i) => {
        const cx = x0 + 3 + i * 62 + 31;
        const up = i % 2 === 0;
        return (
          <g key={i} transform={up ? undefined : `rotate(180 ${cx} -145)`}>
            <rect x={cx - 6} y={-250} width={12} height={8} rx={2} fill="url(#g-metal-h)" />
            <rect x={cx - 28} y={-243} width={56} height={196} rx={7} fill="#2a3035" />
            <rect x={cx - 28} y={-243} width={56} height={58} rx={7} fill="#0d7480" />
            <rect x={cx - 28} y={-192} width={56} height={7} fill="#0a5c66" />
            <rect x={cx - 28} y={-62} width={56} height={15} rx={6} fill="#b9bfc4" />
            <rect x={cx - 28} y={-243} width={56} height={196} rx={7} fill="url(#g-shade-h)" />
            <g transform={up ? undefined : `rotate(180 ${cx} -145)`}>
              <text x={cx} y={-136} fontSize={15} fontWeight={600} textAnchor="middle" fill="#f4f7f8">AA</text>
              <text x={cx} y={-122} fontSize={6} textAnchor="middle" fill="#aeb6bb" fontFamily="var(--font-mono)">1.5 V</text>
            </g>
            <text x={cx} y={-208} fontSize={13} fontWeight={600} textAnchor="middle" fill="#f4f7f8" transform={up ? undefined : `rotate(180 ${cx} -212)`}>+</text>
          </g>
        );
      })}
    </g>
  );
}

function CoinCell() {
  return (
    <g>
      <rect x={-8} y={-10} width={76} height={12} rx={3} fill="#17191b" />
      <circle cx={30} cy={-50} r={43} fill="#17191b" />
      <circle cx={30} cy={-50} r={39} fill="url(#g-metal)" />
      <circle cx={30} cy={-50} r={39} fill="url(#g-dome)" opacity={0.6} />
      <circle cx={30} cy={-50} r={33} fill="none" stroke="#8e959b" strokeWidth={0.6} />
      <text x={30} y={-56} fontSize={18} textAnchor="middle" fill="#6d747a">+</text>
      <text x={30} y={-40} fontSize={7} textAnchor="middle" fill="#6d747a" fontFamily="var(--font-mono)" letterSpacing={0.6}>CR2032</text>
      <text x={30} y={-30} fontSize={6} textAnchor="middle" fill="#6d747a" fontFamily="var(--font-mono)">3 V</text>
      <path d="M-6 -62 h14 v24 h-14 z" fill="url(#g-metal-h)" stroke="#7d848a" strokeWidth={0.5} />
      <text x={-3} y={2.6} fontSize={6} fontWeight={600} fill="#e9605a" fontFamily="var(--font-mono)" transform="translate(6 -9)">+</text>
      <PinTip x={0} y={0} />
      <PinTip x={60} y={0} />
    </g>
  );
}

/* ---------- Instruments ---------- */

function Meter({ part, live }: GProps) {
  const amps = part.props.mode === "A";
  const setProp = useStore((s) => s.setProp);
  const reading = live?.reading ?? (amps ? "–.–– A" : "–.–– V");
  return (
    <g>
      <FlyLead d="M0 -32 C0 -18 0 -12 0 0" color="#1d1f22" />
      <FlyLead d="M30 -32 C30 -18 30 -12 30 0" color="#d63a2f" />
      <PinTip x={0} y={0} />
      <PinTip x={30} y={0} />
      <rect x={-45} y={-220} width={120} height={196} rx={12} fill="#e8a71c" />
      <rect x={-39} y={-214} width={108} height={184} rx={8} fill="#24282c" />
      <rect x={-39} y={-214} width={108} height={184} rx={8} fill="url(#g-shade-v)" opacity={0.5} />
      {/* display */}
      <rect x={-31} y={-205} width={92} height={46} rx={4} fill="#b9c7b4" />
      <rect x={-31} y={-205} width={92} height={46} rx={4} fill="none" stroke="#000" strokeOpacity={0.35} />
      <text x={55} y={-173} fontSize={19} textAnchor="end" fill="#1c2420" fontFamily="var(--font-mono)" fontWeight={500} letterSpacing={-0.5}>
        {reading}
      </text>
      <text x={-26} y={-195} fontSize={5.4} fill="#3d4a42" fontFamily="var(--font-mono)">{amps ? "DC CURRENT" : "DC VOLTAGE"}</text>
      {/* dial */}
      <g
        className="hit-control"
        role="button"
        aria-label={`Meter mode: ${amps ? "current" : "voltage"}. Activate to switch.`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setProp(part.id, "mode", amps ? "V" : "A")}
      >
        <circle cx={15} cy={-106} r={34} fill="#191c1f" />
        <text x={-6} y={-140} fontSize={9} fontWeight={600} fill={amps ? "#7f888e" : "#f4f7f8"} textAnchor="middle">V</text>
        <text x={36} y={-140} fontSize={9} fontWeight={600} fill={amps ? "#f4f7f8" : "#7f888e"} textAnchor="middle">A</text>
        <g transform={`rotate(${amps ? 32 : -32} 15 -106)`} style={{ transition: "transform 140ms ease-out" }}>
          <circle cx={15} cy={-106} r={24} fill="#30353a" />
          <circle cx={15} cy={-106} r={24} fill="url(#g-dome)" />
          <rect x={12} y={-131} width={6} height={50} rx={3} fill="#3d4349" />
          <rect x={13.8} y={-129} width={2.4} height={12} rx={1.2} fill="#f4f7f8" />
        </g>
      </g>
      {/* jacks */}
      <circle cx={0} cy={-44} r={8} fill="#0d0e10" />
      <circle cx={0} cy={-44} r={4} fill="#1d1f22" stroke="#4d5359" strokeWidth={1} />
      <circle cx={30} cy={-44} r={8} fill="#0d0e10" />
      <circle cx={30} cy={-44} r={4} fill="#d63a2f" stroke="#7d1f18" strokeWidth={1} />
      <text x={0} y={-56} fontSize={5} textAnchor="middle" fill="#aeb6bb" fontFamily="var(--font-mono)">COM</text>
      <text x={30} y={-56} fontSize={5} textAnchor="middle" fill="#aeb6bb" fontFamily="var(--font-mono)">V·A</text>
    </g>
  );
}


/* ---------- Arduino Uno ---------- */

const TOP_LABELS: [number, string][] = [
  [7, "SCL"], [8, "SDA"], [9, "AREF"], [10, "GND"], [11, "13"], [12, "12"], [13, "~11"], [14, "~10"], [15, "~9"], [16, "8"],
  [18, "7"], [19, "~6"], [20, "~5"], [21, "4"], [22, "~3"], [23, "2"], [24, "TX 1"], [25, "RX 0"],
];
const BOTTOM_LABELS: [number, string][] = [
  [10, "IOREF"], [11, "RESET"], [12, "3V3"], [13, "5V"], [14, "GND"], [15, "GND"], [16, "VIN"],
  [18, "A0"], [19, "A1"], [20, "A2"], [21, "A3"], [22, "A4"], [23, "A5"],
];

function SmdLed({ x, y, on, color, label }: { x: number; y: number; on: boolean; color: string; label: string }) {
  return (
    <g>
      {on && <circle cx={x + 4} cy={y + 2} r={9} fill={color} opacity={0.35} />}
      <rect x={x} y={y} width={8} height={4} rx={0.8} fill={on ? color : "#8d9a8f"} stroke="#5b645d" strokeWidth={0.4} />
      <text x={x + 12} y={y + 3.4} fontSize={3.8} fill="#d9eef0" fontFamily="var(--font-mono)">{label}</text>
    </g>
  );
}

function Uno({ part, live }: GProps) {
  const u = live?.uno;
  const pressed = useStore((s) => s.pressed.has(part.id));
  const set = useStore((s) => s.setPressed);
  const header = (x0: number, x1: number, y: number) => (
    <rect x={x0 * U - 5} y={y - 7} width={(x1 - x0) * U + 10} height={14} rx={1.6} fill="#1a1c1e" />
  );
  const sockets = (xs: number[], y: number) =>
    xs.map((x) => <rect key={`${x}-${y}`} x={x * U - 2.4} y={y - 2.4} width={4.8} height={4.8} rx={0.6} fill="#050607" stroke="#34383c" strokeWidth={0.5} />);
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  return (
    <g>
      {/* USB-B and power jack stick out past the board edge */}
      <rect x={-24} y={36} width={62} height={48} rx={2} fill="url(#g-metal-h)" stroke="#6f767c" strokeWidth={0.7} />
      <rect x={-24} y={44} width={44} height={32} rx={1.5} fill="#15171a" />
      <rect x={-14} y={52} width={30} height={16} fill="#2a2d31" />
      <rect x={-16} y={132} width={56} height={46} rx={2} fill="#202325" />
      <circle cx={-3} cy={155} r={8} fill="#0c0d0e" />
      <circle cx={-3} cy={155} r={2.6} fill="#555b61" />

      <rect x={0} y={0} width={270} height={210} rx={7} fill="#0e7a84" />
      <rect x={1.2} y={1.2} width={267.6} height={207.6} rx={6} fill="none" stroke="#fff" strokeOpacity={0.14} />
      {[[55, 10], [60, 200], [260, 30], [260, 140]].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r={5.2} fill="#d9eef0" opacity={0.85} />
          <circle cx={x} cy={y} r={3.4} fill="#0a4d54" />
        </g>
      ))}

      {/* chips */}
      <rect x={60} y={64} width={26} height={26} rx={1.5} fill="#1b1d1f" />
      <circle cx={65} cy={69} r={1.4} fill="#4a4f54" />
      <rect x={104} y={124} width={132} height={32} rx={2} fill="#1b1d1f" />
      {range(0, 13).flatMap((i) => [
        <rect key={`t${i}`} x={108 + i * 9} y={120} width={3} height={4} fill="#b4b8bc" />,
        <rect key={`b${i}`} x={108 + i * 9} y={156} width={3} height={4} fill="#b4b8bc" />,
      ])}
      <circle cx={112} cy={133} r={2.2} fill="#34383c" />
      <text x={170} y={138} fontSize={5} fill="#cfd4d8" textAnchor="middle" fontFamily="var(--font-mono)">ATMEGA328P-PU</text>
      <text x={170} y={147} fontSize={4} fill="#8d9499" textAnchor="middle" fontFamily="var(--font-mono)">16 MHz</text>
      <rect x={108} y={92} width={32} height={14} rx={6} fill="url(#g-metal)" stroke="#7d848a" strokeWidth={0.6} />
      <text x={124} y={100.6} fontSize={4} fill="#4e555b" textAnchor="middle" fontFamily="var(--font-mono)">16.000</text>

      {/* reset button */}
      <g
        className="hit-control"
        role="button"
        aria-label="Reset button"
        onPointerDown={(e) => {
          e.stopPropagation();
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          set(part.id, true);
        }}
        onPointerUp={() => set(part.id, false)}
        onPointerCancel={() => set(part.id, false)}
      >
        <rect x={8} y={8} width={22} height={22} rx={2} fill="#1b1d1f" />
        <rect x={10} y={10} width={18} height={18} rx={1.4} fill="url(#g-metal)" />
        <circle cx={19} cy={pressed ? 19 : 18.4} r={pressed ? 5.4 : 6} fill={pressed ? "#8c1d16" : "#c0392b"} />
        <circle cx={19} cy={pressed ? 19 : 18.4} r={pressed ? 5.4 : 6} fill="url(#g-dome)" opacity={0.7} />
      </g>
      <text x={19} y={37} fontSize={3.6} fill="#d9eef0" textAnchor="middle" fontFamily="var(--font-mono)">RESET</text>

      {/* status LEDs */}
      <SmdLed x={150} y={44} on={!!u?.l} color="#ffb020" label="L" />
      <SmdLed x={150} y={52} on={!!u?.tx} color="#ffb020" label="TX" />
      <SmdLed x={150} y={60} on={!!u?.rx} color="#ffb020" label="RX" />
      <SmdLed x={150} y={68} on={!!u?.powered} color="#4dff7a" label="ON" />

      <text x={206} y={106} fontSize={22} fontWeight={600} fill="#e8f4f5" textAnchor="middle" letterSpacing={-0.5}>UNO</text>
      <text x={206} y={116} fontSize={4.4} fill="#bfe0e3" textAnchor="middle" fontFamily="var(--font-mono)">R3 · DIGITAL (~ PWM)</text>

      {/* headers */}
      {header(7, 16, 10)}
      {header(18, 25, 10)}
      {header(10, 16, 200)}
      {header(18, 23, 200)}
      {sockets(range(7, 16), 10)}
      {sockets(range(18, 25), 10)}
      {sockets(range(10, 16), 200)}
      {sockets(range(18, 23), 200)}
      <g fontSize={3.8} fill="#d9eef0" textAnchor="middle" fontFamily="var(--font-mono)">
        {TOP_LABELS.map(([x, t]) => <text key={`t${x}`} x={x * U} y={26}>{t}</text>)}
        {BOTTOM_LABELS.map(([x, t]) => <text key={`b${x}`} x={x * U} y={186}>{t}</text>)}
        <text x={130} y={176} fontSize={4.2} opacity={0.8}>POWER</text>
        <text x={205} y={176} fontSize={4.2} opacity={0.8}>ANALOG IN</text>
      </g>
    </g>
  );
}


/* ---------- Transistor, RGB LED, 7-segment, relay ---------- */

function Npn({ live }: GProps) {
  const burned = live?.burned;
  const body = "M0.5 -10 V-24 A9.5 9.5 0 0 1 19.5 -24 V-10 Z";
  return (
    <g>
      <Lead d="M0 0 V-10" />
      <Lead d="M10 0 V-10" />
      <Lead d="M20 0 V-10" />
      <path d={body} fill={burned ? "#3b3631" : "#1d1f21"} />
      <path d="M0.5 -10 V-24 A9.5 9.5 0 0 1 4 -31" fill="none" stroke="#fff" strokeOpacity={0.18} strokeWidth={1.2} />
      <text x={10} y={-17} fontSize={4.4} textAnchor="middle" fill="#d3d8dc" fontFamily="var(--font-mono)">2N2222</text>
      <text x={0} y={-3.5} fontSize={3.6} fill="#6b7175" fontFamily="var(--font-mono)" textAnchor="middle">E</text>
      <text x={10} y={-3.5} fontSize={3.6} fill="#6b7175" fontFamily="var(--font-mono)" textAnchor="middle">B</text>
      <text x={20} y={-3.5} fontSize={3.6} fill="#6b7175" fontFamily="var(--font-mono)" textAnchor="middle">C</text>
      <path d={body} fill="url(#g-shade-h)" opacity={0.6} />
      {burned && <path d="M5 -33 l3 6 l-3 4 l5 4 M14 -28 l-2 5" stroke="#8a8f94" strokeWidth={0.8} fill="none" />}
    </g>
  );
}

function RgbLed({ live }: GProps) {
  const ch = live?.channels ?? { r: 0, g: 0, b: 0 };
  const mix = (v: number) => Math.round(Math.min(255, 70 + v * 185));
  const lit = Math.max(ch.r, ch.g, ch.b);
  const color = lit > 0.02 ? `rgb(${mix(ch.r)},${mix(ch.g)},${mix(ch.b)})` : "#dfe3e6";
  const dome = "M-3 -16 V-31 A18 18 0 0 1 33 -31 V-16 Z";
  return (
    <g>
      {[0, 10, 20, 30].map((x) => <Lead key={x} d={`M${x} 0 V-16`} />)}
      {lit > 0.02 && <circle cx={15} cy={-30} r={22 + lit * 22} fill={color} opacity={0.18 + lit * 0.3} />}
      <rect x={-5} y={-19} width={40} height={3.4} rx={1.2} fill="#c9ced2" />
      <path d={dome} fill={color} opacity={lit > 0.02 ? 0.92 : 0.7} />
      <path d="M0 -16 V-26 M10 -16 V-24 M20 -16 V-26 M30 -16 V-24" stroke="#000" strokeOpacity={0.22} strokeWidth={1.2} />
      {lit > 0.3 && <ellipse cx={15} cy={-27} rx={7 * lit} ry={8 * lit} fill="#fff" opacity={lit * 0.7} />}
      <path d={dome} fill="url(#g-dome)" />
      {["R", "−", "G", "B"].map((t, i) => (
        <text key={i} x={i * 10} y={-4} fontSize={4.4} textAnchor="middle" fill="#6b7175" fontFamily="var(--font-mono)">{t}</text>
      ))}
    </g>
  );
}

const SEG_SHAPES: Record<string, { x: number; y: number; w: number; h: number }> = {
  a: { x: 11, y: -58, w: 18, h: 4.6 },
  b: { x: 29, y: -54.4, w: 4.6, h: 18 },
  c: { x: 29, y: -32, w: 4.6, h: 18 },
  d: { x: 11, y: -14, w: 18, h: 4.6 },
  e: { x: 6.4, y: -32, w: 4.6, h: 18 },
  f: { x: 6.4, y: -54.4, w: 4.6, h: 18 },
  g: { x: 11, y: -36, w: 18, h: 4.6 },
};

function SevenSeg({ live }: GProps) {
  const ch = live?.channels ?? {};
  return (
    <g>
      {[0, 10, 20, 30, 40].flatMap((x) => [
        <Lead key={`b${x}`} d={`M${x} 0 V-6`} />,
        <Lead key={`t${x}`} d={`M${x} -60 V-54`} />,
      ])}
      <rect x={-6} y={-69} width={52} height={78 - 8} rx={2} fill="#17191b" />
      <rect x={-6} y={-69} width={52} height={70} rx={2} fill="url(#g-shade-v)" opacity={0.5} />
      <g transform="skewX(-5) translate(10 0)">
        {Object.entries(SEG_SHAPES).map(([k, g]) => {
          const v = ch[k] ?? 0;
          return (
            <g key={k}>
              {v > 0.05 && <rect x={g.x - 2} y={g.y - 2} width={g.w + 4} height={g.h + 4} rx={3} fill="#ff3b30" opacity={v * 0.35} />}
              <rect x={g.x} y={g.y} width={g.w} height={g.h} rx={1.6} fill={v > 0.05 ? `rgb(255,${Math.round(70 - v * 30)},${Math.round(60 - v * 30)})` : "#3a2a2a"} />
            </g>
          );
        })}
        <circle cx={38} cy={-12} r={2.6} fill={(ch.dp ?? 0) > 0.05 ? "#ff3b30" : "#3a2a2a"} />
      </g>
      <text x={20} y={4.6} fontSize={3.6} textAnchor="middle" fill="#6b7175" fontFamily="var(--font-mono)">E D − C DP</text>
      <text x={20} y={-62.6} fontSize={3.6} textAnchor="middle" fill="#6b7175" fontFamily="var(--font-mono)">G F − A B</text>
    </g>
  );
}

function Relay({ live }: GProps) {
  const on = !!live?.on;
  return (
    <g>
      {[0, 20, 50, 70, 90].map((x) => <Lead key={x} d={`M${x} 0 V-8`} />)}
      <rect x={-8} y={-66} width={106} height={58} rx={3} fill="#1d4f9c" />
      <rect x={-8} y={-66} width={106} height={58} rx={3} fill="url(#g-shade-v)" />
      <rect x={-3} y={-61} width={96} height={48} rx={2} fill="none" stroke="#fff" strokeOpacity={0.25} strokeWidth={0.7} />
      <text x={45} y={-44} fontSize={7.4} textAnchor="middle" fill="#eef3fb" fontWeight={600}>SRD-05VDC-SL-C</text>
      <text x={45} y={-34} fontSize={4.6} textAnchor="middle" fill="#cfdcf1" fontFamily="var(--font-mono)">10A 250VAC · 10A 30VDC</text>
      <text x={45} y={-25} fontSize={4.6} textAnchor="middle" fill="#cfdcf1" fontFamily="var(--font-mono)">COIL 5 V · 70 Ω</text>
      <circle cx={88} cy={-57} r={3.4} fill={on ? "#ffb020" : "#315f9f"} />
      {on && <circle cx={88} cy={-57} r={9} fill="#ffb020" opacity={0.3} />}
      {[["COIL", 0], ["COIL", 20], ["COM", 50], ["NC", 70], ["NO", 90]].map(([t, x]) => (
        <text key={`${t}${x}`} x={Number(x)} y={-1.4} fontSize={3.8} textAnchor="middle" fill="#6b7175" fontFamily="var(--font-mono)">{t}</text>
      ))}
    </g>
  );
}


/* ---------- Servo, ultrasonic sensor, LCD ---------- */

function ServoGfx({ live }: GProps) {
  const deg = live?.deg ?? 90;
  return (
    <g>
      <FlyLead d="M-30 -76 C-30 -30 0 -50 0 0" color="#6b3f1d" />
      <FlyLead d="M-30 -70 C-30 -26 10 -44 10 0" color="#d63a2f" />
      <FlyLead d="M-30 -64 C-30 -22 20 -38 20 0" color="#e8742a" />
      <PinTip x={0} y={0} />
      <PinTip x={10} y={0} />
      <PinTip x={20} y={0} />
      {/* mounting ears and body */}
      <rect x={-48} y={-92} width={146} height={11} rx={2} fill="#2c63c4" />
      <rect x={-36} y={-132} width={112} height={74} rx={4} fill="#2f6fd6" />
      <rect x={-36} y={-132} width={112} height={74} rx={4} fill="url(#g-shade-h)" opacity={0.55} />
      <rect x={-36} y={-132} width={112} height={10} rx={3} fill="#2557ab" />
      <circle cx={-52} cy={-86} r={3.4} fill="#14161a" />
      <circle cx={102} cy={-86} r={3.4} fill="#14161a" />
      <circle cx={50} cy={-140} r={19} fill="#2f6fd6" />
      <circle cx={50} cy={-140} r={19} fill="url(#g-dome)" opacity={0.5} />
      <text x={-2} y={-98} fontSize={9} fontWeight={600} fill="#e8f0ff" textAnchor="middle" letterSpacing={0.6}>SG90</text>
      <text x={-2} y={-86} fontSize={5} fill="#bcd1f5" textAnchor="middle" fontFamily="var(--font-mono)">9 g · 4.8–6 V</text>
      {/* horn */}
      <g transform={`rotate(${deg - 90} 50 -140)`}>
        <path d="M44 -140 L46 -204 A4 4 0 0 1 54 -204 L56 -140 Z" fill="#f4f6f8" stroke="#aab2b8" strokeWidth={0.7} />
        {[-190, -176, -162].map((y) => <circle key={y} cx={50} cy={y} r={1.6} fill="#8d959b" />)}
        <circle cx={50} cy={-140} r={9} fill="#f4f6f8" stroke="#aab2b8" strokeWidth={0.7} />
        <circle cx={50} cy={-140} r={2.4} fill="#6d747a" />
      </g>
    </g>
  );
}

function Ultrasonic() {
  return (
    <g>
      {[0, 10, 20, 30].map((x) => <Lead key={x} d={`M${x} 0 V-9`} />)}
      <rect x={-72} y={-85} width={177} height={80} rx={3} fill="#1f5fae" />
      <rect x={-72} y={-85} width={177} height={80} rx={3} fill="url(#g-shade-v)" opacity={0.5} />
      {[-26, 62].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={-46} r={31} fill="#b9bfc4" />
          <circle cx={cx} cy={-46} r={27} fill="#2a2e32" />
          <circle cx={cx} cy={-46} r={21} fill="#4b5157" />
          <circle cx={cx} cy={-46} r={9} fill="#2a2e32" />
          <circle cx={cx} cy={-46} r={31} fill="url(#g-dome)" opacity={0.7} />
        </g>
      ))}
      <rect x={4} y={-74} width={14} height={7} rx={1} fill="url(#g-metal)" />
      <rect x={6} y={-20} width={22} height={11} rx={1} fill="#16181a" />
      <text x={17} y={-30} fontSize={7} fontWeight={600} fill="#e6eefb" textAnchor="middle" fontFamily="var(--font-mono)">HC-SR04</text>
      <g fontSize={3.8} fill="#cfdcf1" textAnchor="middle" fontFamily="var(--font-mono)">
        {["VCC", "TRIG", "ECHO", "GND"].map((t, i) => <text key={t} x={i * 10} y={-12.4}>{t}</text>)}
      </g>
    </g>
  );
}

const DOT = 2.5;
const CELL_W = 15;
const CELL_H = 27;

/** Column bytes for a character code: the font for ASCII, or a custom character from CGRAM. */
function cellColumns(code: number, cgram: number[][]): number[] {
  if (code < 16) {
    const rows = cgram[code & 7] ?? [];
    return Array.from({ length: 5 }, (_, c) => rows.reduce((acc, row, r) => acc | (((row >> (4 - c)) & 1) << r), 0));
  }
  return glyph(code) ?? [0, 0, 0, 0, 0];
}

function Lcd({ live }: GProps) {
  const lcd = live?.lcd;
  const dim = lcd ? Math.max(0.04, lcd.contrast) : 0.1;
  const backlit = (lcd?.backlight ?? 0) > 0.05;
  const ink = lcd ? (lcd.on || lcd.blocks) : false;
  let dots = "";
  if (lcd && ink) {
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 16; col++) {
        const x0 = col * CELL_W, y0 = row * CELL_H;
        const solid = lcd.blocks && (row === 0 || lcd.contrast >= 1);
        const cols = solid ? [127, 127, 127, 127, 127] : lcd.on ? cellColumns(lcd.rows[row][col], lcd.cgram) : [0, 0, 0, 0, 0];
        for (let c = 0; c < 5; c++) {
          for (let r = 0; r < 8; r++) {
            if ((cols[c] >> r) & 1 || (solid && r === 7)) dots += `M${(x0 + c * (DOT + 0.4)).toFixed(1)} ${(y0 + r * (DOT + 0.4)).toFixed(1)}h${DOT}v${DOT}h-${DOT}z`;
          }
        }
      }
    }
  }
  const cur = lcd?.on ? lcd.cursor : null;
  return (
    <g>
      {Array.from({ length: 16 }, (_, i) => <Lead key={i} d={`M${i * 10} 0 V-8`} />)}
      <rect x={-26} y={-8} width={340} height={150} rx={3} fill="#1c6d3d" />
      <rect x={-26} y={-8} width={340} height={150} rx={3} fill="url(#g-shade-v)" opacity={0.4} />
      <rect x={-12} y={28} width={312} height={4} fill="none" />
      {[[-14, 6], [-14, 126], [300, 6], [300, 126]].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r={3.2} fill="#0b3a20" stroke="#cfe3d3" strokeWidth={0.8} />
      ))}
      {/* the glass */}
      <rect x={8} y={18} width={276} height={104} rx={2} fill="#2b2e30" />
      <rect x={20} y={32} width={256} height={74} fill={backlit ? "#b6d84a" : "#7d927a"} opacity={backlit ? 1 : 0.9} />
      {backlit && <rect x={20} y={32} width={256} height={74} fill="#e5ff7a" opacity={0.25 * (lcd?.backlight ?? 0)} />}
      <g transform="translate(25 38)">
        <path d={dots} fill="#16260c" opacity={dim * 0.95} />
        {cur && cur.underline && <rect x={cur.col * CELL_W} y={cur.row * CELL_H + 7 * (DOT + 0.4)} width={5 * (DOT + 0.4) - 0.4} height={DOT} fill="#16260c" opacity={dim} />}
        {cur && cur.blink && <rect className="blink" x={cur.col * CELL_W} y={cur.row * CELL_H} width={5 * (DOT + 0.4) - 0.4} height={8 * (DOT + 0.4) - 0.4} fill="#16260c" opacity={dim} />}
      </g>
      <rect x={20} y={32} width={256} height={74} fill="url(#g-shade-v)" opacity={0.18} />
      <rect x={8} y={18} width={276} height={104} rx={2} fill="url(#g-dome)" opacity={0.08} />
      <g fontSize={3.8} fill="#d9eef0" textAnchor="middle" fontFamily="var(--font-mono)">
        {["VSS", "VDD", "V0", "RS", "RW", "E", "D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7", "A", "K"].map((t, i) => <text key={t} x={i * 10} y={6}>{t}</text>)}
        <text x={150} y={134} fontSize={5} opacity={0.85}>1602A · HD44780</text>
      </g>
    </g>
  );
}


/* ---------- Oscilloscope ---------- */

const SC_W = 200;
const SC_H = 160;
const SC_X = 0;
const SC_Y = -232;
const SC_GROUND = SC_Y + SC_H - 20; // 0 V sits one division above the bottom

function trace(t: number[], v: number[], tdiv: number, vdiv: number): string {
  const span = tdiv * 10;
  let d = "";
  for (let i = 0; i < t.length; i++) {
    const x = SC_X + (t[i] / span) * SC_W;
    const y = Math.max(SC_Y, Math.min(SC_Y + SC_H, SC_GROUND - (v[i] / vdiv) * 20));
    d += `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

const fmtT = (s: number) => (s >= 1 ? `${s} s` : s >= 0.001 ? `${+(s * 1000).toFixed(2)} ms` : `${+(s * 1e6).toFixed(0)} µs`);

function Scope({ part, live }: GProps) {
  const sc = live?.scope;
  const tdiv = Number(part.props.tdiv) || 0.002;
  const v1 = Number(part.props.v1div) || 1;
  const v2 = Number(part.props.v2div) || 1;
  const trig = Number(part.props.trig);
  const f = sc?.stats1.freq;
  return (
    <g>
      <FlyLead d="M-8 -66 C-8 -30 0 -40 0 0" color="#ffd84a" />
      <FlyLead d="M6 -66 C6 -26 10 -34 10 0" color="#45e0f0" />
      <FlyLead d="M20 -66 C20 -24 20 -30 20 0" color="#1d1f22" />
      <PinTip x={0} y={0} />
      <PinTip x={10} y={0} />
      <PinTip x={20} y={0} />
      <rect x={-20} y={-250} width={266} height={190} rx={9} fill="#2a2f35" />
      <rect x={-20} y={-250} width={266} height={190} rx={9} fill="url(#g-shade-v)" opacity={0.5} />
      <rect x={-8} y={-240} width={216} height={176} rx={4} fill="#14171a" />
      <clipPath id="scope-screen"><rect x={SC_X} y={SC_Y} width={SC_W} height={SC_H} /></clipPath>
      <rect x={SC_X} y={SC_Y} width={SC_W} height={SC_H} fill="#07120d" />
      <g stroke="#2f6b49" strokeWidth={0.5} opacity={0.9}>
        {Array.from({ length: 11 }, (_, i) => <line key={`v${i}`} x1={SC_X + i * 20} x2={SC_X + i * 20} y1={SC_Y} y2={SC_Y + SC_H} />)}
        {Array.from({ length: 9 }, (_, i) => <line key={`h${i}`} x1={SC_X} x2={SC_X + SC_W} y1={SC_Y + i * 20} y2={SC_Y + i * 20} />)}
      </g>
      <g stroke="#3f8a60" strokeWidth={0.5}>
        {Array.from({ length: 51 }, (_, i) => <line key={`mx${i}`} x1={SC_X + i * 4} x2={SC_X + i * 4} y1={SC_GROUND - 1.4} y2={SC_GROUND + 1.4} />)}
      </g>
      <g clipPath="url(#scope-screen)" fill="none" strokeLinejoin="round" strokeLinecap="round">
        {sc && sc.t.length > 1 && (
          <>
            <path d={trace(sc.t, sc.ch2, tdiv, v2)} stroke="#45e0f0" strokeWidth={3.2} opacity={0.18} />
            <path d={trace(sc.t, sc.ch2, tdiv, v2)} stroke="#6df0ff" strokeWidth={1.1} />
            <path d={trace(sc.t, sc.ch1, tdiv, v1)} stroke="#ffd84a" strokeWidth={3.2} opacity={0.18} />
            <path d={trace(sc.t, sc.ch1, tdiv, v1)} stroke="#ffe680" strokeWidth={1.1} />
          </>
        )}
      </g>
      {Number.isFinite(trig) && (
        <path d={`M${SC_X + SC_W + 1} ${SC_GROUND - (trig / v1) * 20} l7 -3.5 v7 z`} fill="#ffd84a" opacity={0.9} />
      )}
      <g fontFamily="var(--font-mono)" fontSize={6}>
        <text x={SC_X + 4} y={SC_Y + 9} fill="#ffe680">{f !== undefined ? (f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${f.toFixed(f < 100 ? 1 : 0)} Hz`) : "– Hz"}</text>
        <text x={SC_X + 54} y={SC_Y + 9} fill="#ffe680">{sc?.stats1.duty !== undefined ? `${(sc.stats1.duty * 100).toFixed(0)} %` : ""}</text>
        <text x={SC_X + SC_W - 4} y={SC_Y + 9} fill="#ffe680" textAnchor="end">{sc ? `${sc.stats1.vpp.toFixed(2)} Vpp` : ""}</text>
        <text x={SC_X + 4} y={SC_Y + SC_H + 9} fill="#ffe680">CH1 {v1} V</text>
        <text x={SC_X + 66} y={SC_Y + SC_H + 9} fill="#6df0ff">CH2 {v2} V</text>
        <text x={SC_X + SC_W - 4} y={SC_Y + SC_H + 9} fill="#c8d4cc" textAnchor="end">{fmtT(tdiv)}/div {sc ? (sc.triggered ? "· TRIG" : "· AUTO") : ""}</text>
      </g>
      {/* decorative knobs */}
      {[[222, -208], [222, -170], [222, -132], [222, -94]].map(([x, y]) => (
        <g key={`${x}${y}`}>
          <circle cx={x} cy={y} r={11} fill="#14171a" />
          <circle cx={x} cy={y} r={8.4} fill="#3b4148" />
          <circle cx={x} cy={y} r={8.4} fill="url(#g-dome)" />
          <rect x={x - 0.9} y={y - 8} width={1.8} height={6} rx={0.9} fill="#e8eef0" />
        </g>
      ))}
      <text x={-4} y={-70} fontSize={5} fill="#9aa4ab" fontFamily="var(--font-mono)">OSCILLOSCOPE</text>
      <g fontSize={4} fill="#9aa4ab" fontFamily="var(--font-mono)" textAnchor="middle">
        <text x={0} y={-3}>CH1</text>
        <text x={10} y={-3}>CH2</text>
        <text x={20} y={-3}>GND</text>
      </g>
    </g>
  );
}


/* ---------- OLED (SSD1306) ---------- */

const OLED_COLORS: Record<string, [string, string]> = {
  white: ["#eaf1ff", "#eaf1ff"],
  blue: ["#7cc4ff", "#7cc4ff"],
  yellowblue: ["#ffe66d", "#7cc4ff"], // many modules are yellow in the top 16 rows
};

/** Lit pixels as runs along each row, so a screenful of text is a few hundred small shapes. */
function oledRuns(o: NonNullable<GProps["live"]>["oled"] & object, fromRow: number, toRow: number): string {
  let d = "";
  for (let y = fromRow; y < toRow; y++) {
    let x = 0;
    while (x < OLED_W) {
      if (!pixel(o, x, y)) { x++; continue; }
      let end = x;
      while (end < OLED_W && pixel(o, end, y)) end++;
      d += `M${x} ${y}h${end - x}v1h-${end - x}z`;
      x = end;
    }
  }
  return d;
}

function OledGfx({ part, live }: GProps) {
  const o = live?.oled;
  const [top, bottom] = OLED_COLORS[String(part.props.color)] ?? OLED_COLORS.white;
  const split = String(part.props.color) === "yellowblue" ? 16 : 0;
  const lit = !!o?.lit;
  const bright = o ? 0.35 + (o.contrast / 255) * 0.65 : 1;
  const scale = 0.62;
  return (
    <g>
      {[0, 10, 20, 30].map((x) => <Lead key={x} d={`M${x} 0 V9`} />)}
      <rect x={-38} y={8} width={106} height={102} rx={4} fill="#0f1c2b" />
      <rect x={-38} y={8} width={106} height={102} rx={4} fill="url(#g-shade-v)" opacity={0.4} />
      {[[-32, 14], [62, 14], [-32, 104], [62, 104]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r={2.8} fill="#cdd6df" />)}
      <g fontSize={4} fill="#9db3c9" textAnchor="middle" fontFamily="var(--font-mono)">
        {["GND", "VCC", "SCL", "SDA"].map((t, i) => <text key={t} x={i * 10} y={20}>{t}</text>)}
      </g>
      <rect x={-31} y={28} width={92} height={56} rx={2} fill="#020305" />
      <rect x={-31} y={28} width={92} height={56} rx={2} fill="none" stroke="#1d2a38" strokeWidth={0.8} />
      <g transform={`translate(${15 - (OLED_W * scale) / 2} ${56 - (OLED_H * scale) / 2}) scale(${scale})`}>
        {lit && o && (
          <>
            {split > 0 && <path d={oledRuns(o, 0, split)} fill={top} opacity={bright} />}
            <path d={oledRuns(o, split, OLED_H)} fill={bottom} opacity={bright} />
          </>
        )}
      </g>
      {!lit && <text x={15} y={58} fontSize={5} textAnchor="middle" fill="#2b3a4a" fontFamily="var(--font-mono)">{o ? "OFF" : ""}</text>}
      <text x={15} y={98} fontSize={5} textAnchor="middle" fill="#9db3c9" fontFamily="var(--font-mono)">{'0.96" 128×64 · I²C'}</text>
    </g>
  );
}

/* ---------- Dispatcher ---------- */

interface GProps {
  part: Part;
  live?: PartLive;
}

export function PartGraphic({ part, live }: GProps) {
  switch (part.type) {
    case "breadboard": return <Breadboard />;
    case "uno": return <Uno part={part} live={live} />;
    case "npn": return <Npn part={part} live={live} />;
    case "rgbled": return <RgbLed part={part} live={live} />;
    case "sevenseg": return <SevenSeg part={part} live={live} />;
    case "relay": return <Relay part={part} live={live} />;
    case "servo": return <ServoGfx part={part} live={live} />;
    case "hcsr04": return <Ultrasonic />;
    case "lcd1602": return <Lcd part={part} live={live} />;
    case "scope": return <Scope part={part} live={live} />;
    case "oled": return <OledGfx part={part} live={live} />;
    case "battery9v": return <Battery9V />;
    case "batteryAA2": return <AAHolder cells={2} />;
    case "batteryAA4": return <AAHolder cells={4} />;
    case "coincell": return <CoinCell />;
    case "resistor": return <Resistor part={part} live={live} />;
    case "led": return <Led part={part} live={live} />;
    case "diode": return <Diode />;
    case "capacitor": return <Capacitor part={part} />;
    case "button": return <Button part={part} />;
    case "switch": return <Switch part={part} />;
    case "pot": return <Pot part={part} />;
    case "ldr": return <Ldr />;
    case "buzzer": return <Buzzer part={part} live={live} />;
    case "motor": return <Motor part={part} live={live} />;
    case "meter": return <Meter part={part} live={live} />;
  }
}
