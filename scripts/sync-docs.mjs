#!/usr/bin/env node
/**
 * Publish the production Studio bundle into `docs/` for GitHub Pages.
 *
 * GitHub Pages serves the repository `/docs` folder, so the static bundle has to be
 * committed next to `404.html` (the SPA fallback). Running this after `vite build`
 * guarantees the published bundle can never drift from `src/`.
 *
 * Usage: `pnpm run build:docs`
 */
import { cp, rm, copyFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const docs = path.join(root, "docs");

if (!existsSync(path.join(dist, "index.html"))) {
  console.error("dist/index.html is missing. Run `pnpm run build` first.");
  process.exit(1);
}

await mkdir(docs, { recursive: true });
await rm(path.join(docs, "assets"), { recursive: true, force: true });
await cp(path.join(dist, "assets"), path.join(docs, "assets"), {
  recursive: true,
});

// `index.html` is the entry point and also the 404 fallback for deep links.
await copyFile(path.join(dist, "index.html"), path.join(docs, "index.html"));
await copyFile(path.join(dist, "index.html"), path.join(docs, "404.html"));

const assets = await readdir(path.join(docs, "assets"));
console.log(`Synced dist/ -> docs/ (${assets.length} asset files).`);
