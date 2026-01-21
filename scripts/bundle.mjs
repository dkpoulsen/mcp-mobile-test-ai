/**
 * Build script using esbuild for bundling
 */

import * as esbuild from "esbuild";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, "../package.json"), "utf-8"));

const isProduction = process.env.NODE_ENV === "production";

async function build() {
  console.info("Bundling with esbuild...");

  const ctx = await esbuild.context({
    entryPoints: ["src/index.ts", "src/cli/index.ts"],
    bundle: true,
    platform: "node",
    target: "node18",
    format: "esm",
    outdir: "dist",
    outExtension: { ".js": ".mjs" },
    sourcemap: isProduction ? false : "inline",
    minify: isProduction,
    treeShaking: true,
    external: [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
    ],
    define: {
      "process.env.NODE_ENV": isProduction ? '"production"' : '"development"',
    },
  });

  if (process.argv.includes("--watch")) {
    await ctx.watch();
    console.info("Watching for changes...");
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    console.info("Bundle complete!");
  }
}

build().catch((error) => {
  console.error("Build failed:", error);
  process.exit(1);
});
