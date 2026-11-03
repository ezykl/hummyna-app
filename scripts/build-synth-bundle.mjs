// Bundles SpessaSynth (+ its core dependency) into a single self-contained IIFE
// script, and stages the AudioWorklet processor, both as Metro assets (.txt so
// they are copied verbatim rather than parsed as source).
//
// Run: npm run build:synth   (after `npm install`)
import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "assets", "synth");
mkdirSync(outDir, { recursive: true });

await build({
  stdin: {
    contents: 'export { WorkletSynthesizer, Sequencer } from "spessasynth_lib";',
    resolveDir: root,
    loader: "js",
  },
  bundle: true,
  format: "iife",
  globalName: "SpessaSynthLib",
  minify: true,
  outfile: resolve(outDir, "spessasynth.bundle.txt"),
  logLevel: "warning",
});

copyFileSync(
  resolve(root, "node_modules", "spessasynth_lib", "dist", "spessasynth_processor.min.js"),
  resolve(outDir, "spessasynth_processor.txt"),
);
copyFileSync(
  resolve(root, "node_modules", "spessasynth_lib", "LICENSE"),
  resolve(outDir, "LICENSE-spessasynth_lib.txt"),
);

console.log("built synth assets ->", outDir);
