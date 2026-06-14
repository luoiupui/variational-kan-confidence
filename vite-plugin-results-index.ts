import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

/**
 * Auto-discovers experiment results under `docs/results/<run-id>/meta.json`,
 * exposes the directory at `/results-data/...` (dev + build), and writes a
 * `/results-index.json` consumed by the React `/results` page.
 *
 * No manifest to maintain: every run that ships a valid `meta.json` appears
 * on the site automatically.
 */
export function resultsIndexPlugin(opts?: {
  sourceDir?: string;
  urlPrefix?: string;
}): Plugin {
  const sourceDir = path.resolve(opts?.sourceDir ?? "docs/results");
  const urlPrefix = opts?.urlPrefix ?? "/results-data";

  type RunEntry = {
    id: string;
    title: string;
    date: string;
    description?: string;
    dataset?: string;
    sequence?: string;
    tags?: string[];
    metrics?: Record<string, number>;
    figures?: { file: string; caption?: string }[];
    series?: string;
    error?: string;
  };

  function scan(): { generatedAt: string; runs: RunEntry[] } {
    const runs: RunEntry[] = [];
    if (fs.existsSync(sourceDir)) {
      for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const metaPath = path.join(sourceDir, entry.name, "meta.json");
        if (!fs.existsSync(metaPath)) continue;
        try {
          const raw = JSON.parse(fs.readFileSync(metaPath, "utf8"));
          runs.push({ id: entry.name, ...raw });
        } catch (err) {
          runs.push({
            id: entry.name,
            title: entry.name,
            date: "",
            error: `Invalid meta.json: ${(err as Error).message}`,
          });
        }
      }
    }
    runs.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return { generatedAt: new Date().toISOString(), runs };
  }

  function copyDir(src: string, dst: string) {
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, entry.name);
      const d = path.join(dst, entry.name);
      if (entry.isDirectory()) copyDir(s, d);
      else fs.copyFileSync(s, d);
    }
  }

  let viteRoot = process.cwd();

  return {
    name: "vkan:results-index",
    configResolved(cfg) {
      viteRoot = cfg.root;
    },

    // Dev: serve docs/results at /results-data/* and the index at /results-index.json.
    configureServer(server) {
      const handle = (req: import("http").IncomingMessage, res: import("http").ServerResponse, next: () => void) => {
        const url = req.url || "";
        if (url === "/results-index.json" || url.startsWith("/results-index.json?")) {
          const body = JSON.stringify(scan());
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(body);
          return;
        }
        if (url.startsWith(urlPrefix + "/")) {
          const rel = decodeURIComponent(url.slice(urlPrefix.length + 1).split("?")[0]);
          const filePath = path.join(sourceDir, rel);
          if (
            filePath.startsWith(sourceDir) &&
            fs.existsSync(filePath) &&
            fs.statSync(filePath).isFile()
          ) {
            const ext = path.extname(filePath).toLowerCase();
            const types: Record<string, string> = {
              ".png": "image/png",
              ".jpg": "image/jpeg",
              ".jpeg": "image/jpeg",
              ".svg": "image/svg+xml",
              ".json": "application/json",
              ".webp": "image/webp",
            };
            res.setHeader("Content-Type", types[ext] ?? "application/octet-stream");
            fs.createReadStream(filePath).pipe(res);
            return;
          }
          res.statusCode = 404;
          res.end("not found");
          return;
        }
        next();
      };
      server.middlewares.use(handle);
    },

    // Build: emit results-index.json and copy docs/results into the bundle.
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "results-index.json",
        source: JSON.stringify(scan(), null, 2),
      });
    },
    writeBundle(options) {
      const outDir = options.dir ?? path.join(viteRoot, "dist");
      copyDir(sourceDir, path.join(outDir, urlPrefix.replace(/^\//, "")));
    },
  };
}