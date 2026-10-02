import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

interface Target { id: string; name: string }

/** Only verified maps in the launcher's directories may be overwritten. */
export function createMapFileStore(directory: string, sourceDirectories: string[]) {
  const targets = new Map<string, { file: string; digest: string }>();
  const hash = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
  const register = (file: string, digest: string): Target => {
    const id = randomUUID();
    targets.set(id, { file, digest });
    return { id, name: path.basename(file) };
  };
  const encode = (file: string, data: string) => {
    if (!data.includes("\r\n") || !data.includes("<svg")) throw new Error("Invalid map data");
    return /\.gz$/i.test(file) ? gzipSync(data) : Buffer.from(data, "utf8");
  };
  return {
    async associate(name: string, digest: string): Promise<Target | null> {
      if (path.basename(name) !== name || !/\.(map|gz)$/i.test(name)) return null;
      for (const source of sourceDirectories) {
        const file = path.join(source, name);
        try {
          if (hash(await fs.readFile(file)) === digest) return register(file, digest);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      return null;
    },
    async save(id: string, data: string): Promise<Target> {
      const target = targets.get(id);
      if (!target) throw new Error("Open the map file again before saving");
      const oldData = await fs.readFile(target.file);
      if (hash(oldData) !== target.digest) throw new Error("The file changed outside the editor. Use Save as…");
      const bytes = encode(target.file, data);
      const temporary = `${target.file}.${randomUUID()}.tmp`;
      try {
        await fs.writeFile(temporary, bytes, { flag: "wx" });
        // A single recovery file, not a new timestamped copy on every save.
        await fs.writeFile(`${target.file}.bak`, oldData);
        await fs.rename(temporary, target.file);
        target.digest = hash(bytes);
      } finally {
        await fs.rm(temporary, { force: true });
      }
      return { id, name: path.basename(target.file) };
    },
    async saveAs(name: string, data: string): Promise<Target> {
      if (path.basename(name) !== name || /[<>:"/\\|?*\x00-\x1f]/.test(name) || !/\.map$/i.test(name)
        || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(name)) throw new Error("Enter a valid file name");
      const file = path.join(directory, name);
      const bytes = encode(file, data);
      await fs.writeFile(file, bytes, { flag: "wx" });
      return register(file, hash(bytes));
    }
  };
}
