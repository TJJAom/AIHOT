// Generates the report nameplates (site/brand/nameplates/*.svg and index.json): the subject word
// from site/site.ts (in the accent) and the Traditional Chinese title, set in Noto Sans TC Bold
// (SIL OFL 1.1) as SVG paths, so the nameplate is one static logotype on every system. The Latin
// capitals are scaled to stand as tall as the Chinese glyphs, both centred on one line, and the spacing
// is set by ink, pair by pair.
//
// Usage: node scripts/nameplates.ts <fontsource package directory or static .ttf file>
// Local deployment: node scripts/nameplates.ts assets/og-fonts/noto-sans-tc-700.ttf
// Fontsource packages with a 900.css and WOFF slices remain supported.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import opentype from "opentype.js";
import { SITE } from "@aihot/site";

const pkg = process.argv[2];
if (!pkg) throw new Error("usage: node scripts/nameplates.ts <fontsource package dir or static .ttf>");

/** Ink height of the Chinese glyphs, in the nameplate's units. */
const H = 220;
/** Latin capitals a touch shorter than the ideographs, which read larger. */
const CAPS = H * 0.94;
const MARGIN = 12;
const isLatin = (ch: string) => /[A-Za-z]/.test(ch);
/** Space between the inks of two neighbours. */
function gap(a: string, b: string): number {
  if (isLatin(a) && isLatin(b)) return H * 0.07;
  if (isLatin(a) !== isLatin(b)) return H * 0.17;
  return H * 0.085;
}

const S = SITE.subject;
const NAMEPLATES: Record<string, Array<{ text: string; accent: boolean }>> = {
  daily: [
    { text: S, accent: true },
    { text: "日報", accent: false },
  ],
  weekly: [
    { text: S, accent: true },
    { text: "週報", accent: false },
  ],
  monthly: [
    { text: S, accent: true },
    { text: "月報", accent: false },
  ],
  archive: [
    { text: "日報", accent: false },
    { text: "合訂本", accent: true },
  ],
};

// Which woff slice of the 900 weight holds each character.
const directBytes = pkg.endsWith(".ttf") ? readFileSync(pkg) : null;
const directFont = directBytes ? opentype.parse(directBytes.buffer.slice(directBytes.byteOffset, directBytes.byteOffset + directBytes.byteLength)) : null;
const css = directFont ? "" : readFileSync(path.join(pkg, "900.css"), "utf8");
const faces = [...css.matchAll(/url\(\.\/files\/([\w-]+)\.woff2\)[^;]*;\s*unicode-range: ([^;]+);/g)].map((m) => ({
  file: `${m[1]}.woff`,
  ranges: m[2]!.split(",").map((r) => r.trim().replace("U+", "").split("-").map((h) => parseInt(h, 16))),
}));
const fonts = new Map<string, opentype.Font>();
function fontFor(ch: string): opentype.Font {
  if (directFont) {
    if (!directFont.charToGlyphIndex(ch)) throw new Error(`font has no glyph for ${ch}`);
    return directFont;
  }
  const cp = ch.codePointAt(0)!;
  const face = faces.find((f) => f.ranges.some(([a, b]) => cp >= a! && cp <= (b ?? a!)));
  if (!face) throw new Error(`no slice holds ${ch}`);
  if (!fonts.has(face.file)) {
    const buf = readFileSync(path.join(pkg, "files", face.file));
    fonts.set(face.file, opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));
  }
  return fonts.get(face.file)!;
}

// One scale for all the Chinese glyphs and one for the capitals, from their union ink at 1000 units;
// both are centred on the same line.
const chars = [...new Set(Object.values(NAMEPLATES).flatMap((parts) => parts.flatMap((p) => [...p.text])))];
const boxes = new Map(chars.map((ch) => [ch, fontFor(ch).getPath(ch, 0, 0, 1000).getBoundingBox()]));
function fit(group: string[], height: number) {
  const top = Math.min(...group.map((ch) => boxes.get(ch)!.y1));
  const bottom = Math.max(...group.map((ch) => boxes.get(ch)!.y2));
  const size = (1000 * height) / (bottom - top);
  return { size, baseline: -((top + bottom) / 2) * (size / 1000) };
}
const cjk = fit(chars.filter((ch) => !isLatin(ch)), H);
const latin = chars.some(isLatin) ? fit(chars.filter(isLatin), CAPS) : cjk;

const out: Record<string, { viewBox: string; accent: string; ink: string }> = {};
for (const [name, parts] of Object.entries(NAMEPLATES)) {
  const accent: string[] = [];
  const ink: string[] = [];
  let x = MARGIN;
  let prev: string | null = null;
  for (const part of parts) {
    for (const ch of part.text) {
      const { size, baseline } = isLatin(ch) ? latin : cjk;
      const box = boxes.get(ch)!;
      const scale = size / 1000;
      if (prev) x += gap(prev, ch);
      const origin = x - box.x1 * scale;
      (part.accent ? accent : ink).push(fontFor(ch).getPath(ch, origin, baseline, size).toPathData(1));
      x = origin + box.x2 * scale;
      prev = ch;
    }
  }
  const half = Math.max(H, CAPS) / 2 + MARGIN;
  out[name] = { viewBox: `0 ${(-half).toFixed(1)} ${(x + MARGIN).toFixed(1)} ${(2 * half).toFixed(1)}`, accent: accent.join(" "), ink: ink.join(" ") };
}

const target = "site/brand/nameplates";
mkdirSync(target, { recursive: true });
for (const [name, n] of Object.entries(out)) {
  writeFileSync(`${target}/${name}.svg`, `<!-- Generated by scripts/nameplates.ts. Noto Sans ${directFont ? "TC" : "SC"} (SIL OFL 1.1). -->\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n.viewBox}"><path id="accent" d="${n.accent}"/><path id="ink" d="${n.ink}"/></svg>\n`);
}
writeFileSync(`${target}/index.json`, `${JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.viewBox])), null, 2)}\n`);
console.log(target, Object.fromEntries(Object.entries(out).map(([k, v]) => [k, `${v.viewBox} · ${((v.accent.length + v.ink.length) / 1000).toFixed(1)} kB`])));
