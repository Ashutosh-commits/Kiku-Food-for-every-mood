import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(root) {
  const output = [];
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    const stat = statSync(full);
    if (stat.isDirectory()) output.push(...walk(full));
    else if (full.endsWith(".js") && !full.includes("node_modules")) output.push(full);
  }
  return output;
}

const files = [...walk("server"), "scripts/static-check.mjs"];
for (const file of files) execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
console.log(`Static server syntax check passed for ${files.length} files.`);
