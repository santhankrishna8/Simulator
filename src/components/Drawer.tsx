"use client";

import { useMemo, useRef, useState } from "react";
import { CATALOG_LIST, CATEGORIES, type PartDef } from "@/sim/catalog";
import { useStore } from "@/store";
import { PartGraphic, U } from "./PartGraphics";

function Thumb({ def }: { def: PartDef }) {
  const b = def.box;
  const pad = 0.6;
  return (
    <svg viewBox={`${(b.x - pad) * U} ${(b.y - pad) * U} ${(b.w + pad * 2) * U} ${(b.h + pad * 2) * U}`} aria-hidden>
      <PartGraphic part={{ id: `thumb-${def.type}`, type: def.type, x: 0, y: 0, rot: 0, props: { ...def.defaults } }} />
    </svg>
  );
}

export default function Drawer({ onPicked }: { onPicked?: () => void }) {
  const [query, setQuery] = useState("");
  const set = useStore((s) => s.set);
  const dragged = useRef(false);
  const q = query.trim().toLowerCase();
  const groups = useMemo(
    () =>
      CATEGORIES.map((cat) => ({
        cat,
        items: CATALOG_LIST.filter((d) => d.category === cat && (!q || `${d.name} ${d.blurb} ${cat}`.toLowerCase().includes(q))),
      })).filter((g) => g.items.length),
    [q],
  );

  return (
    <aside className="drawer" aria-label="Parts">
      <div className="panel-head">
        <h2>Parts</h2>
        <input
          type="search"
          placeholder="Search parts"
          aria-label="Search parts"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="drawer-list">
        {groups.map((g) => (
          <section key={g.cat}>
            <h3>{g.cat}</h3>
            <ul>
              {g.items.map((def) => (
                <li key={def.type}>
                  <button
                    type="button"
                    className="part-card"
                    onPointerDown={(e) => {
                      // Mouse and pen drag the part out. Touch scrolls the list, so a tap adds instead.
                      if (e.pointerType === "touch" || (e.pointerType === "mouse" && e.button !== 0)) return;
                      (e.target as Element).releasePointerCapture?.(e.pointerId);
                      dragged.current = true;
                      window.addEventListener("pointerup", () => setTimeout(() => (dragged.current = false), 0), { once: true });
                      set({ placing: def.type, wiring: null });
                    }}
                    onClick={() => {
                      if (dragged.current) {
                        dragged.current = false;
                        return;
                      }
                      // Keyboard or touch: drop it in the middle of the bench.
                      set({ placing: def.type, wiring: null });
                      onPicked?.();
                      setTimeout(() => window.dispatchEvent(new PointerEvent("pointerup", { clientX: -1, clientY: -1 })), 60);
                    }}
                  >
                    <span className="part-thumb">
                      <Thumb def={def} />
                    </span>
                    <span className="part-meta">
                      <b>{def.name}</b>
                      <small>{def.blurb}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {!groups.length && <p className="empty">No part matches “{query}”.</p>}
      </div>
      <p className="drawer-foot">Drag a part onto the bench, or click to drop it in the middle.</p>
    </aside>
  );
}
