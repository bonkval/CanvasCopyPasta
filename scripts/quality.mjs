import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { spawnSync } from "node:child_process";

const roots = [".", "scripts", "tests"];
const ignored = new Set(["node_modules", "dist", ".git", ".agents", ".codex"]);
const files = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes:true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else files.push(path);
  }
}
await walk(".");

let failed = false;
for (const file of files) {
  if ([".js", ".mjs"].includes(extname(file))) {
    const result = spawnSync(process.execPath, ["--check", file], { encoding:"utf8" });
    if (result.status !== 0) { process.stderr.write(result.stderr); failed = true; }
  }
  if ([".js", ".mjs", ".json", ".md", ".css", ".html"].includes(extname(file))) {
    const text = await readFile(file, "utf8");
    if (/\r/.test(text)) { console.error(`${file}: use LF line endings`); failed = true; }
    if (/[^\S\r\n]+$/m.test(text) && extname(file) !== ".md") { console.error(`${file}: trailing whitespace`); failed = true; }
  }
  if (extname(file) === ".json") {
    try { JSON.parse(await readFile(file, "utf8")); } catch (error) { console.error(`${file}: ${error.message}`); failed = true; }
  }
}
if (failed) process.exit(1);
console.log(`Quality checks passed for ${files.length} files.`);
