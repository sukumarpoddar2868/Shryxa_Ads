// Copies MapLibre's web worker into public/ so the browser can load it
// (MapLibre 6 resolves the worker next to its own module, which bundlers move).
// Runs before `dev` and `build`; the copy is git-ignored.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const dist = join(dirname(require.resolve("maplibre-gl/package.json")), "dist");
mkdirSync("public/vendor", { recursive: true });
copyFileSync(join(dist, "maplibre-gl-worker.mjs"), "public/vendor/maplibre-gl-worker.mjs");
console.log("Copied MapLibre worker → public/vendor/maplibre-gl-worker.mjs");
