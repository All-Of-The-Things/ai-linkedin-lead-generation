import fs from "node:fs/promises";
import path from "node:path";

export async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw new Error(`Failed to read/parse ${filePath}: ${err.message}`);
  }
}

// Atomic write (write to a temp file, then rename) — state/connections_cache.json's
// own history shows a plain overwrite can corrupt mid-write (see its "_note" after
// the 2026-08-27 rebuild). Never skip this for files other processes/commands read.
export async function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}`);
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2) + "\n", "utf8");
  await fs.rename(tmpPath, filePath);
}

export async function listDir(dirPath) {
  try {
    return await fs.readdir(dirPath);
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}
