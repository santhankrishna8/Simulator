import { sanitizeProject, type Project, type Sanitized } from "./sanitize";

const VERSION = "1";
/** A decoded project larger than this is refused before it is parsed (a guard against compression bombs). */
const MAX_JSON = 400_000;

const toB64Url = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromB64Url = (text: string): Uint8Array => {
  const s = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit = Infinity): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  void writer.write(bytes as BufferSource).then(() => writer.close()).catch(() => {});
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      throw new Error("too large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** The bench and sketch as a short text that fits in a link. Nothing else is included. */
export async function encodeProject(project: Project): Promise<string> {
  const json = JSON.stringify({ v: 1, doc: project.doc, code: project.code });
  const packed = await pipe(new TextEncoder().encode(json), new CompressionStream("deflate-raw"));
  return `${VERSION}.${toB64Url(packed)}`;
}

/** Open what encodeProject made, trusting none of it. */
export async function decodeProject(text: string): Promise<Sanitized> {
  const bad = (error: string): Sanitized => ({ ok: false, error });
  const m = /^(\d+)\.([A-Za-z0-9_-]+)$/.exec(text.trim());
  if (!m) return bad("That link is not complete. Copy it again from the share window.");
  if (m[1] !== VERSION) return bad("That link was made by a newer version of the simulator.");
  let json: string;
  try {
    json = new TextDecoder().decode(await pipe(fromB64Url(m[2]), new DecompressionStream("deflate-raw"), MAX_JSON));
  } catch {
    return bad("That link could not be opened. It may have been cut short.");
  }
  try {
    return sanitizeProject(JSON.parse(json));
  } catch {
    return bad("That link could not be opened. It may have been cut short.");
  }
}

/** Parse a project file the person chose. */
export function readProjectFile(text: string): Sanitized {
  if (text.length > MAX_JSON) return { ok: false, error: "That file is too large to be a project." };
  try {
    return sanitizeProject(JSON.parse(text));
  } catch {
    return { ok: false, error: "That file is not a project from this simulator." };
  }
}

/** The text of a downloadable project file. */
export const projectFile = (project: Project) => JSON.stringify({ v: 1, doc: project.doc, code: project.code }, null, 1);
