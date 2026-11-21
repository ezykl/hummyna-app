// Builds the HumMyna brand PNGs (docs/superpowers/specs/2026-11-19-brand-mascot-png-design.md).
// Artwork is hand-authored vector art (kawaii common myna "Myna") rendered offline
// with @resvg/resvg-js — no network, no AI service.
//
// Run: npm run build:brand
import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "assets", "images");
mkdirSync(outDir, { recursive: true });

const C = {
  blue: "#2b6cb0",
  body: "#1e293b",
  wing: "#334155",
  amber: "#f59e0b",
  gold: "#fbbf24",
  belly: "#f1f5f9",
  sky: "#38bdf8",
  coral: "#f43f5e",
  ink: "#0f172a",
};

function note(x, y, s, color, rot = 0) {
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">` +
    `<ellipse cx="0" cy="0" rx="15" ry="11" transform="rotate(-18)" fill="${color}"/>` +
    `<rect x="11" y="-58" width="7" height="60" rx="3.5" fill="${color}"/>` +
    `<path d="M 18 -58 q 24 12 8 36 Z" fill="${color}"/></g>`;
}

function sparkle(x, y, s, color) {
  return `<path transform="translate(${x} ${y}) scale(${s})" d="M 0 -14 Q 3 -3 14 0 Q 3 3 0 14 Q -3 3 -14 0 Q -3 -3 0 -14 Z" fill="${color}"/>`;
}

function confetti(x, y, s, color, rot = 0) {
  return `<rect x="${x}" y="${y}" width="${16 * s}" height="${16 * s}" rx="3" transform="rotate(${rot} ${x} ${y})" fill="${color}"/>`;
}

function bird(pose) {
  const singing = pose === "singing";
  const celebrate = pose === "celebrate";
  const cheer = pose === "cheer";
  const empty = pose === "empty";
  const search = pose === "search";
  const eyeDY = empty ? -10 : search ? 8 : 0;
  const blush = singing || celebrate || cheer;

  const parts = [];

  if (empty) {
    parts.push(`<ellipse cx="256" cy="486" rx="120" ry="14" fill="${C.ink}" opacity="0.12"/>`);
  }

  // tail + body + head
  parts.push(`<path d="M 150 372 Q 96 420 74 468 Q 140 458 178 424 Z" fill="${C.body}"/>`);
  parts.push(`<ellipse cx="256" cy="330" rx="128" ry="148" fill="${C.body}"/>`);
  parts.push(`<circle cx="256" cy="204" r="104" fill="${C.body}"/>`);
  parts.push(`<ellipse cx="256" cy="362" rx="86" ry="102" fill="${C.belly}"/>`);

  // wings (raised on celebratory poses)
  parts.push(`<ellipse cx="128" cy="330" rx="38" ry="82" transform="rotate(18 128 330)" fill="${C.wing}"/>`);
  if (celebrate || cheer) {
    parts.push(`<ellipse cx="368" cy="238" rx="36" ry="76" transform="rotate(-42 368 238)" fill="${C.wing}"/>`);
  } else {
    parts.push(`<ellipse cx="384" cy="330" rx="38" ry="82" transform="rotate(-18 384 330)" fill="${C.wing}"/>`);
  }

  // amber face patch + beak
  parts.push(`<ellipse cx="256" cy="248" rx="80" ry="38" fill="${C.gold}"/>`);
  if (singing) {
    parts.push(`<path d="M 224 258 L 288 258 L 256 286 Z" fill="${C.amber}"/>`);
    parts.push(`<ellipse cx="256" cy="292" rx="16" ry="10" fill="${C.ink}"/>`);
    parts.push(`<path d="M 236 298 L 276 298 L 256 320 Z" fill="${C.amber}"/>`);
  } else {
    parts.push(`<path d="M 226 260 L 286 260 L 256 296 Z" fill="${C.amber}"/>`);
  }

  // eyes (big, kawaii, with glints)
  for (const ex of [200, 312]) {
    parts.push(`<circle cx="${ex}" cy="${210 + eyeDY}" r="25" fill="${C.ink}"/>`);
    parts.push(`<circle cx="${ex - 8}" cy="${202 + eyeDY}" r="8" fill="#ffffff"/>`);
    parts.push(`<circle cx="${ex + 6}" cy="${220 + eyeDY}" r="4" fill="#ffffff" opacity="0.9"/>`);
  }

  if (blush) {
    parts.push(`<ellipse cx="176" cy="252" rx="14" ry="8" fill="${C.coral}" opacity="0.3"/>`);
    parts.push(`<ellipse cx="336" cy="252" rx="14" ry="8" fill="${C.coral}" opacity="0.3"/>`);
  }
  if (celebrate || cheer) {
    parts.push(`<path d="M 226 264 Q 256 292 286 264" stroke="${C.ink}" stroke-width="7" fill="none" stroke-linecap="round"/>`);
  }

  // royal-blue studio headphones
  parts.push(`<path d="M 134 186 A 122 122 0 0 1 378 186" stroke="${C.blue}" stroke-width="26" fill="none" stroke-linecap="round"/>`);
  parts.push(`<rect x="110" y="168" width="46" height="76" rx="22" fill="${C.blue}"/>`);
  parts.push(`<rect x="118" y="178" width="30" height="56" rx="15" fill="${C.body}"/>`);
  parts.push(`<rect x="356" y="168" width="46" height="76" rx="22" fill="${C.blue}"/>`);
  parts.push(`<rect x="364" y="178" width="30" height="56" rx="15" fill="${C.body}"/>`);

  // feet
  parts.push(`<ellipse cx="224" cy="474" rx="20" ry="10" fill="${C.amber}"/>`);
  parts.push(`<ellipse cx="288" cy="474" rx="20" ry="10" fill="${C.amber}"/>`);

  if (singing) {
    parts.push(`<path d="M 402 196 q 26 26 0 52" stroke="${C.sky}" stroke-width="11" fill="none" stroke-linecap="round"/>`);
    parts.push(`<path d="M 432 176 q 40 46 0 92" stroke="${C.sky}" stroke-width="11" fill="none" stroke-linecap="round" opacity="0.7"/>`);
    parts.push(note(392, 122, 1, C.sky, 12));
    parts.push(note(118, 132, 0.8, C.coral, -10));
    parts.push(note(304, 78, 0.65, C.gold, 6));
  }
  if (celebrate) {
    parts.push(confetti(84, 116, 1, C.coral, 20));
    parts.push(`<circle cx="152" cy="88" r="9" fill="${C.sky}"/>`);
    parts.push(confetti(408, 108, 0.9, C.gold, -15));
    parts.push(`<circle cx="382" cy="66" r="8" fill="${C.coral}"/>`);
    parts.push(sparkle(96, 196, 1, C.gold));
    parts.push(note(58, 300, 0.7, C.sky, -8));
    parts.push(note(446, 288, 0.7, C.coral, 10));
  }
  if (cheer) {
    parts.push(sparkle(122, 108, 0.9, C.gold));
    parts.push(sparkle(402, 98, 0.8, C.sky));
    parts.push(sparkle(436, 222, 0.7, C.coral));
  }
  if (empty) {
    parts.push(note(334, 108, 0.9, C.sky, 10));
  }
  if (search) {
    parts.push(`<circle cx="330" cy="310" r="80" fill="#ffffff" opacity="0.14"/>`);
    parts.push(`<circle cx="330" cy="310" r="80" fill="none" stroke="${C.blue}" stroke-width="20"/>`);
    parts.push(`<path d="M 300 254 q -34 22 -26 62" stroke="#ffffff" stroke-width="12" fill="none" stroke-linecap="round" opacity="0.5"/>`);
    parts.push(`<line x1="390" y1="374" x2="446" y2="438" stroke="${C.blue}" stroke-width="22" stroke-linecap="round"/>`);
  }

  return parts.join("");
}

function mascotSvg(pose, backdrop = false) {
  const inner = bird(pose);
  const scale = backdrop ? 0.78 : 1;
  const bg = backdrop ? `<rect x="10" y="10" width="492" height="492" rx="100" fill="${C.blue}"/>` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">` +
    bg +
    `<g transform="translate(256 300) scale(${scale}) translate(-256 -300)">${inner}</g>` +
    `</svg>`
  );
}

const JOBS = [
  { file: "icon.png", pose: "base", size: 1024, backdrop: true },
  { file: "adaptive-icon.png", pose: "base", size: 1024, backdrop: false },
  { file: "splash-icon.png", pose: "base", size: 512, backdrop: false },
  { file: "favicon.png", pose: "base", size: 192, backdrop: true },
  { file: "mascot-header.png", pose: "base", size: 64, backdrop: false },
  { file: "mascot-empty.png", pose: "empty", size: 320, backdrop: false },
  { file: "mascot-search.png", pose: "search", size: 240, backdrop: false },
  { file: "mascot-singing.png", pose: "singing", size: 300, backdrop: false },
  { file: "mascot-celebrate.png", pose: "celebrate", size: 320, backdrop: false },
  { file: "mascot-cheer.png", pose: "cheer", size: 320, backdrop: false },
];

for (const job of JOBS) {
  const svg = mascotSvg(job.pose, job.backdrop);
  const png = new Resvg(svg, { fitTo: { mode: "width", value: job.size } }).render().asPng();
  const out = resolve(outDir, job.file);
  writeFileSync(out, png);
  console.log(`built ${job.file} (${job.size}x${job.size}, ${png.length} bytes)`);
}
console.log(`brand assets -> ${outDir}`);
