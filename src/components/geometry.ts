import { CATALOG } from "@/sim/catalog";
import { pinPos, type Doc } from "@/sim/model";
import { U } from "./PartGraphics";

export function wirePath(a: [number, number], b: [number, number]): string {
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

export function bounds(doc: Doc) {
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

