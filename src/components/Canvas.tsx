"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATALOG, HOLES, formatSI, type PartType } from "@/sim/catalog";
import { collides, findPin, partsOnBoard, pinPos, refPos, type Doc, type Part, type PinRef } from "@/sim/model";
import { useStore } from "@/store";
import { PartGraphic, U } from "./PartGraphics";

interface View {
  x: number;
  y: number;
  k: number;
}

const MIN_K = 0.35;
const MAX_K = 6;

function wirePath(a: [number, number], b: [number, number]): string {
  const ax = a[0] * U, ay = a[1] * U, bx = b[0] * U, by = b[1] * U;
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const sag = Math.min(26, len * 0.16);
  // Bow to one consistent side so parallel jumpers do not cross.
  let nx = -dy / len, ny = dx / len;
  if (ny < 0 || (ny === 0 && nx < 0)) {
    nx = -nx;
    ny = -ny;
  }
  return `M${ax} ${ay} Q${(ax + bx) / 2 + nx * sag} ${(ay + by) / 2 + ny * sag} ${bx} ${by}`;
}

function bounds(doc: Doc) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of doc.parts) {
    const b = CATALOG[p.type].box;
    for (const [cx, cy] of [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]]) {
      const pin = { id: "", label: "", x: cx, y: cy };
      const [x, y] = pinPos(p, pin);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  }
  if (!isFinite(x0)) return { x0: 0, y0: 0, x1: 40, y1: 24 };
  return { x0, y0, x1, y1 };
}

export default function Canvas() {
  const doc = useStore((s) => s.doc);
  const selection = useStore((s) => s.selection);
  const snapshot = useStore((s) => s.snapshot);
  const flow = useStore((s) => s.flow);
  const showFlow = useStore((s) => s.showFlow);
  const running = useStore((s) => s.running);
  const wiring = useStore((s) => s.wiring);
  const placing = useStore((s) => s.placing);
  const fitTick = useStore((s) => s.fitTick);

  const wrap = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 300, y: 200, k: 2 });
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const [hover, setHover] = useState<{ ref: PinRef; cx: number; cy: number } | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);

  const toGrid = useCallback((clientX: number, clientY: number): [number, number] => {
    const r = wrap.current!.getBoundingClientRect();
    const v = viewRef.current;
    return [(clientX - r.left - v.x) / v.k / U, (clientY - r.top - v.y) / v.k / U];
  }, []);

  /* ----- fit to content ----- */
  const fit = useCallback(() => {
    const el = wrap.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const b = bounds(useStore.getState().doc);
    const w = (b.x1 - b.x0) * U, h = (b.y1 - b.y0) * U;
    const pad = Math.min(72, r.width * 0.08);
    const k = Math.max(MIN_K, Math.min(3.2, (r.width - pad * 2) / w, (r.height - pad * 2) / h));
    setView({ k, x: r.width / 2 - (b.x0 * U + w / 2) * k, y: r.height / 2 - (b.y0 * U + h / 2) * k });
  }, []);
  useEffect(() => {
    fit();
  }, [fit, fitTick]);

  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    const r = wrap.current!.getBoundingClientRect();
    setView((v) => {
      const k = Math.max(MIN_K, Math.min(MAX_K, v.k * factor));
      const px = clientX - r.left, py = clientY - r.top;
      return { k, x: px - ((px - v.x) / v.k) * k, y: py - ((py - v.y) / v.k) * k };
    });
  }, []);

  useEffect(() => {
    const el = wrap.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  /* ----- pointer gestures: pan, pinch, drag parts ----- */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<
    | { kind: "pan"; moved: boolean; lastX: number; lastY: number }
    | { kind: "pinch"; dist: number }
    | { kind: "part"; id: string; from: Doc; riders: Set<string>; gx: number; gy: number; px: number; py: number; moved: boolean }
    | null
  >(null);
  const wireDown = useRef<{ x: number; y: number } | null>(null);

  const pinAt = (target: EventTarget | null): PinRef | null => {
    const el = target as HTMLElement | null;
    const part = el?.dataset?.part;
    const pin = el?.dataset?.pin;
    return part && pin ? { part, pin } : null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const st = useStore.getState();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      gesture.current = { kind: "pinch", dist: Math.hypot(a.x - b.x, a.y - b.y) };
      return;
    }
    const pin = pinAt(e.target);
    if (pin) {
      wireDown.current = st.wiring ? null : { x: e.clientX, y: e.clientY };
      st.pinClicked(pin);
      return;
    }
    const wireId = (e.target as HTMLElement).dataset?.wire;
    if (wireId) {
      st.set({ selection: { kind: "wire", id: wireId }, wiring: null });
      return;
    }
    const partEl = (e.target as Element).closest?.("[data-body]") as HTMLElement | null;
    if (partEl) {
      const id = partEl.dataset.body!;
      const part = st.doc.parts.find((p) => p.id === id)!;
      const [gx, gy] = toGrid(e.clientX, e.clientY);
      const riders = new Set(part.type === "breadboard" ? partsOnBoard(st.doc, id) : []);
      riders.add(id);
      gesture.current = { kind: "part", id, from: st.doc, riders, gx, gy, px: part.x, py: part.y, moved: false };
      st.set({ selection: { kind: "part", id }, wiring: null });
      wrap.current!.setPointerCapture(e.pointerId);
      return;
    }
    gesture.current = { kind: "pan", moved: false, lastX: e.clientX, lastY: e.clientY };
    wrap.current!.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g?.kind === "pinch" && pointers.current.size >= 2) {
      const [a, b] = Array.from(pointers.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, dist / g.dist);
      g.dist = dist;
      return;
    }
    if (g?.kind === "pan") {
      const dx = e.clientX - g.lastX, dy = e.clientY - g.lastY;
      if (Math.abs(dx) + Math.abs(dy) > 2) g.moved = true;
      g.lastX = e.clientX;
      g.lastY = e.clientY;
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
      return;
    }
    if (g?.kind === "part") {
      const [gx, gy] = toGrid(e.clientX, e.clientY);
      const dx = Math.round(gx - g.gx), dy = Math.round(gy - g.gy);
      if (dx || dy) g.moved = true;
      const parts = g.from.parts.map((p) => (g.riders.has(p.id) ? { ...p, x: p.x + dx, y: p.y + dy } : p));
      useStore.getState().set({ doc: { ...g.from, parts } });
      return;
    }
    const st = useStore.getState();
    if (st.wiring) setCursor(toGrid(e.clientX, e.clientY));
    const pin = pinAt(e.target);
    if (pin) {
      const r = wrap.current!.getBoundingClientRect();
      setHover({ ref: pin, cx: e.clientX - r.left, cy: e.clientY - r.top });
    }
    else if (hover) setHover(null);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    const st = useStore.getState();
    if (g?.kind === "pinch") {
      gesture.current = null;
      return;
    }
    gesture.current = null;
    if (g?.kind === "pan") {
      if (!g.moved) st.set({ selection: null, wiring: null });
      return;
    }
    if (g?.kind === "part") {
      const cur = st.doc.parts.find((p) => p.id === g.id);
      if (!cur || !g.moved) {
        st.set({ doc: g.from });
        return;
      }
      if (!st.movePart(g.id, cur.x, cur.y, g.from)) {
        st.set({ doc: g.from });
        st.say("Those holes are already taken.");
      }
      return;
    }
    // Drag-to-wire: released over a different pin after a real drag.
    const down = wireDown.current;
    wireDown.current = null;
    if (st.wiring && down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) {
      const pin = pinAt(document.elementFromPoint(e.clientX, e.clientY));
      if (pin) st.pinClicked(pin);
    }
  };

  /* ----- placing a part dragged from the drawer ----- */
  useEffect(() => {
    if (!placing) return;
    const inside = (x: number, y: number) => {
      const r = wrap.current!.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };
    const move = (e: PointerEvent) => {
      if (!inside(e.clientX, e.clientY)) return setGhost(null);
      const [gx, gy] = toGrid(e.clientX, e.clientY);
      setGhost({ x: Math.round(gx), y: Math.round(gy) });
    };
    const up = (e: PointerEvent) => {
      const st = useStore.getState();
      const type = st.placing as PartType;
      st.set({ placing: null });
      setGhost(null);
      if (inside(e.clientX, e.clientY)) {
        const [gx, gy] = toGrid(e.clientX, e.clientY);
        st.addPart(type, gx, gy);
      } else {
        // A plain click in the drawer: drop it in the middle of the view.
        const r = wrap.current!.getBoundingClientRect();
        const [cx, cy] = toGrid(r.left + r.width / 2, r.top + r.height / 2);
        const box = CATALOG[type].box;
        let x = Math.round(cx - box.x - box.w / 2), y = Math.round(cy - box.y - box.h / 2);
        for (let tries = 0; tries < 12; tries++) {
          const probe: Part = { id: "__new", type, x, y, rot: 0, props: {} };
          const overlap = st.doc.parts.some((p) => p.type === type && p.x === x && p.y === y);
          if (!overlap && !collides(st.doc, probe)) break;
          x += 2;
          y += 2;
        }
        st.addPart(type, x, y);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [placing, toGrid]);

  /* ----- derived drawing data ----- */
  const boards = doc.parts.filter((p) => p.type === "breadboard");
  const others = useMemo(
    () => doc.parts.filter((p) => p.type !== "breadboard").sort((a, b) => a.y - b.y || a.x - b.x),
    [doc.parts],
  );
  const hoverInfo = useMemo(() => {
    if (!hover) return null;
    const part = doc.parts.find((p) => p.id === hover.ref.part);
    const pin = part && findPin(part, hover.ref.pin);
    if (!part || !pin) return null;
    const volts = running || snapshot ? snapshot?.voltageAt(hover.ref) : undefined;
    const strip = part.type === "breadboard" ? HOLES.find((h) => h.id === pin.id)?.strip : undefined;
    return { part, pin, volts, strip };
  }, [hover, doc.parts, snapshot, running]);

  const wiringPos = wiring ? refPos(doc, wiring) : null;
  const transform = `translate(${view.x} ${view.y}) scale(${view.k})`;
  const dot = 10 * view.k;

  return (
    <div
      ref={wrap}
      className={`canvas${wiring ? " is-wiring" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => setHover(null)}
      style={{
        backgroundSize: `${dot * 5}px ${dot * 5}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
      }}
    >
      <svg width="100%" height="100%" role="application" aria-label="Circuit workbench">
        <g transform={transform}>
          {boards.map((b) => (
            <g key={b.id} transform={`translate(${b.x * U} ${b.y * U})`} className="part">
              <g data-body={b.id} className="part-body board-body">
                <PartGraphic part={b} />
              </g>
              {hoverInfo?.strip && hoverInfo.part.id === b.id && <StripHighlight strip={hoverInfo.strip} />}
              {HOLES.map((h) => (
                <circle key={h.id} cx={h.x * U} cy={h.y * U} r={4.4} className="pin-hit" data-part={b.id} data-pin={h.id} />
              ))}
              {selection?.kind === "part" && selection.id === b.id && <SelectionBox type="breadboard" />}
            </g>
          ))}

          {others.map((p) => (
            <g key={p.id} transform={`translate(${p.x * U} ${p.y * U}) rotate(${p.rot * 90})`} className="part">
              <g data-body={p.id} className="part-body">
                <PartGraphic part={p} live={snapshot?.parts[p.id]} />
              </g>
              {selection?.kind === "part" && selection.id === p.id && <SelectionBox type={p.type} />}
            </g>
          ))}

          {doc.wires.map((w) => {
            const a = refPos(doc, w.a), b = refPos(doc, w.b);
            if (!a || !b) return null;
            const d = wirePath(a, b);
            const amps = snapshot?.wires[w.id] ?? 0;
            const selected = selection?.kind === "wire" && selection.id === w.id;
            return (
              <g key={w.id} className="wire">
                {selected && <path d={d} className="wire-selected" />}
                <path d={d} stroke="rgba(0,0,0,0.3)" strokeWidth={4.4} fill="none" strokeLinecap="round" transform="translate(0 0.8)" />
                <path d={d} stroke={w.color} strokeWidth={3.4} fill="none" strokeLinecap="round" />
                <path d={d} stroke="#fff" strokeOpacity={0.28} strokeWidth={0.9} fill="none" strokeLinecap="round" transform="translate(-0.5 -0.6)" />
                {showFlow && Math.abs(amps) > 1e-6 && (
                  <path d={d} className="wire-flow" strokeDashoffset={-(flow[w.id] ?? 0)} />
                )}
                {[a, b].map((pt, i) => (
                  <g key={i}>
                    <circle cx={pt[0] * U} cy={pt[1] * U} r={2.5} fill="#55595e" />
                    <circle cx={pt[0] * U} cy={pt[1] * U} r={1.5} fill="#d9dcdf" />
                  </g>
                ))}
                <path d={d} className="wire-hit" data-wire={w.id} />
              </g>
            );
          })}

          {/* free part pins sit above everything so wires can start from them */}
          {others.map((p) =>
            CATALOG[p.type].pins.map((pin) => {
              const [x, y] = pinPos(p, pin);
              return <circle key={`${p.id}.${pin.id}`} cx={x * U} cy={y * U} r={4.4} className="pin-hit" data-part={p.id} data-pin={pin.id} />;
            }),
          )}

          {wiringPos && (
            <>
              <circle cx={wiringPos[0] * U} cy={wiringPos[1] * U} r={5.5} className="wire-start" />
              {cursor && <path d={wirePath(wiringPos, cursor)} className="wire-preview" />}
            </>
          )}

          {ghost && placing && (
            <g transform={`translate(${ghost.x * U} ${ghost.y * U})`} opacity={0.6} pointerEvents="none">
              <PartGraphic part={{ id: "__ghost", type: placing, x: 0, y: 0, rot: 0, props: { ...CATALOG[placing].defaults } }} />
            </g>
          )}
        </g>
      </svg>

      {hoverInfo && hover && (
        <div className="probe" style={{ left: hover.cx + 14, top: hover.cy + 14 }}>
          <span>{hoverInfo.part.type === "breadboard" ? hoverInfo.pin.label : `${CATALOG[hoverInfo.part.type].name} · ${hoverInfo.pin.label}`}</span>
          {hoverInfo.volts !== undefined && <b>{formatSI(Math.abs(hoverInfo.volts) < 5e-4 ? 0 : hoverInfo.volts, "V")}</b>}
        </div>
      )}

      {wiring && <div className="hint">Click another pin or hole to finish the wire. Esc cancels.</div>}

      <div className="zoom" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" aria-label="Zoom out" onClick={() => { const r = wrap.current!.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.3); }}>−</button>
        <button type="button" className="zoom-fit" onClick={fit}>Fit</button>
        <button type="button" aria-label="Zoom in" onClick={() => { const r = wrap.current!.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.3); }}>+</button>
      </div>
    </div>
  );
}

function SelectionBox({ type }: { type: PartType }) {
  const b = CATALOG[type].box;
  return <rect x={b.x * U - 3} y={b.y * U - 3} width={b.w * U + 6} height={b.h * U + 6} rx={5} className="selection" />;
}

/** Shows which holes are joined inside the breadboard. */
function StripHighlight({ strip }: { strip: string }) {
  const holes = HOLES.filter((h) => h.strip === strip);
  const xs = holes.map((h) => h.x), ys = holes.map((h) => h.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return <rect x={x0 * U - 4} y={y0 * U - 4} width={(x1 - x0) * U + 8} height={(y1 - y0) * U + 8} rx={4} className="strip" />;
}
