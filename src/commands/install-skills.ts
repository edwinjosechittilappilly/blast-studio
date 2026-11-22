import { existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, symlinkSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Command, IO } from "../io.ts";
import { UserError } from "../types.ts";

export const SKILLS_SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), "../../skills");
export const run: Command = async (args, io) => installSkills(args, io);
export async function installSkills(args: string[], io: IO, sourceRoot = SKILLS_SOURCE): Promise<number> {
  if (args.some((arg) => arg !== "--with-hyperframes") || args.length > 1)
    throw new UserError("usage: bstudio install-skills [--with-hyperframes]");
  const home = io.env.HOME;
  if (!home) throw new UserError("HOME is not set");
  let skipped = 0;
  const skills = existsSync(sourceRoot)
    ? readdirSync(sourceRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory() && existsSync(join(sourceRoot, entry.name, "SKILL.md")))
    : [];
  if (!skills.length) io.out("no skills found");
  for (const dir of [join(home, ".agents", "skills"), join(home, ".claude", "skills")]) {
    mkdirSync(dir, { recursive: true });
    for (const skill of skills) {
      const source = join(sourceRoot, skill.name), link = join(dir, skill.name);
      let existing;
      try { existing = lstatSync(link); } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }
      if (existing && !existing.isSymbolicLink()) {
        io.out(`skipped ${link}: a real file or directory already exists`);
        skipped++;
        continue;
      }
      if (existing) {
        if (readlinkSync(link) === source) { io.out(`ok ${link}`); continue; }
        unlinkSync(link);
      }
      symlinkSync(source, link, "dir");
      io.out(`linked ${link} -> ${source}`);
    }
  }
  if (args.includes("--with-hyperframes")) {
    await io.run("npx", ["--yes", "skills@1.9.0", "add", "heygen-com/hyperframes"], { env: io.env });
    io.out("Installed HyperFrames skills (heygen-com/hyperframes; Apache-2.0).");
  }
  return skipped ? 1 : 0;
}
