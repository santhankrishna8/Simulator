"use client";

import { cpp } from "@codemirror/lang-cpp";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { setDiagnostics, lintGutter, type Diagnostic as CmDiagnostic } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import CodeMirror from "@uiw/react-codemirror";
import { useEffect, useRef } from "react";
import { useStore } from "@/store";

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "13.5px", backgroundColor: "var(--surface)", color: "var(--ink)" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.6" },
  ".cm-content": { padding: "10px 0" },
  ".cm-gutters": { backgroundColor: "var(--surface)", color: "var(--ink-3)", border: "none", paddingLeft: "4px" },
  ".cm-activeLine": { backgroundColor: "var(--bg)" },
  ".cm-activeLineGutter": { backgroundColor: "var(--bg)", color: "var(--ink-2)" },
  "&.cm-focused": { outline: "none" },
  "&.cm-focused .cm-cursor": { borderLeftColor: "var(--accent)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { backgroundColor: "var(--accent-wash) !important" },
  ".cm-tooltip": { border: "1px solid var(--line-strong)", borderRadius: "8px", backgroundColor: "var(--surface)", color: "var(--ink)", fontFamily: "var(--font-sans)" },
  ".cm-diagnostic-error": { borderLeft: "3px solid var(--danger)" },
});

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.modifier], color: "#0d7480", fontWeight: "500" },
  { tag: [t.typeName, t.standard(t.typeName)], color: "#7a4a9e" },
  { tag: [t.string, t.character], color: "#8a5a00" },
  { tag: [t.number, t.bool, t.null], color: "#b3261e" },
  { tag: [t.lineComment, t.blockComment], color: "#72848d", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#1f5ea8" },
  { tag: [t.macroName, t.processingInstruction, t.meta], color: "#7a4a9e" },
]);

export default function Editor() {
  const code = useStore((s) => s.code);
  const setCode = useStore((s) => s.setCode);
  const diagnostics = useStore((s) => s.build.diagnostics);
  const view = useRef<EditorView | null>(null);

  // Show compiler errors as underlines and gutter markers.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const marks: CmDiagnostic[] = diagnostics
      .filter((d) => d.file === "sketch.ino")
      .map((d) => {
        const line = v.state.doc.line(Math.min(Math.max(1, d.line), v.state.doc.lines));
        const from = Math.min(line.to, line.from + Math.max(0, d.column - 1));
        const end = /^\w+/.exec(v.state.sliceDoc(from, line.to));
        return { from, to: end ? from + end[0].length : Math.max(from, line.to), severity: d.severity, message: d.message };
      });
    v.dispatch(setDiagnostics(v.state, marks));
  }, [diagnostics]);

  return (
    <CodeMirror
      value={code}
      height="100%"
      basicSetup={{ foldGutter: false, highlightActiveLine: true, autocompletion: false }}
      extensions={[cpp(), theme, syntaxHighlighting(highlight), lintGutter(), EditorView.contentAttributes.of({ "aria-label": "Arduino sketch" })]}
      onChange={setCode}
      onCreateEditor={(v) => {
        view.current = v;
      }}
    />
  );
}
