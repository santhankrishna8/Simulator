import type { Doc } from "@/sim/model";
import { refPos } from "@/sim/model";
import { bounds, wirePath } from "./geometry";
import { PartGraphic, U } from "./PartGraphics";

/** A still picture of the bench, framed to fit, for the printed guide. */
export default function BenchDiagram({ doc }: { doc: Doc }) {
  const b = bounds(doc);
  const pad = 14;
  const x = b.x0 * U - pad, y = b.y0 * U - pad;
  const w = (b.x1 - b.x0) * U + pad * 2, h = (b.y1 - b.y0) * U + pad * 2;
  const boards = doc.parts.filter((p) => p.type === "breadboard");
  const others = doc.parts.filter((p) => p.type !== "breadboard");
  return (
    <svg className="diagram" viewBox={`${x} ${y} ${w} ${h}`} role="img" aria-label="Picture of the circuit">
      {[...boards, ...others].map((p) => (
        <g key={p.id} transform={`translate(${p.x * U} ${p.y * U})${p.type === "breadboard" ? "" : ` rotate(${p.rot * 90})`}`}>
          <PartGraphic part={p} />
        </g>
      ))}
      {doc.wires.map((wire) => {
        const a = refPos(doc, wire.a), c = refPos(doc, wire.b);
        if (!a || !c) return null;
        const d = wirePath(a, c);
        return (
          <g key={wire.id}>
            <path d={d} stroke="rgba(0,0,0,0.3)" strokeWidth={4.4} fill="none" strokeLinecap="round" />
            <path d={d} stroke={wire.color} strokeWidth={3.4} fill="none" strokeLinecap="round" />
          </g>
        );
      })}
    </svg>
  );
}
