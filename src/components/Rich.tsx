import { Fragment } from "react";

/** Inline **bold** and `code`. Everything else is plain text, so lesson text can never inject markup. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : p.startsWith("`") ? <code key={i}>{p.slice(1, -1)}</code> : <Fragment key={i}>{p}</Fragment>,
      )}
    </>
  );
}

/**
 * A very small markup for lesson text: blank lines separate paragraphs, lines starting with
 * "- " make a list, and **bold** and `code` work inside lines.
 */
export default function Rich({ text }: { text: string }) {
  const blocks: ({ kind: "p"; text: string } | { kind: "ul"; items: string[] })[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    const last = blocks[blocks.length - 1];
    if (!t) {
      blocks.push({ kind: "p", text: "" });
    } else if (t.startsWith("- ")) {
      if (last?.kind === "ul") last.items.push(t.slice(2));
      else blocks.push({ kind: "ul", items: [t.slice(2)] });
    } else if (last?.kind === "p" && last.text) {
      last.text += ` ${t}`;
    } else if (last?.kind === "p" && !last.text) {
      last.text = t;
    } else blocks.push({ kind: "p", text: t });
  }
  return (
    <div className="rich">
      {blocks.map((b, i) =>
        b.kind === "ul" ? (
          <ul key={i}>{b.items.map((it, k) => <li key={k}><Inline text={it} /></li>)}</ul>
        ) : b.text ? (
          <p key={i}><Inline text={b.text} /></p>
        ) : null,
      )}
    </div>
  );
}
