import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentEnv, sandboxCommand } from "../agent-env.ts";
import type { IO } from "../io.ts";
import { UserError, type StudioConfig } from "../types.ts";
const guidance: Record<string, string> = {
  ffmpeg: "brew install ffmpeg (or your OS package manager)",
  ffprobe: "brew install ffmpeg (or your OS package manager)",
  vhs: "brew install vhs",
  hyperframes: "npm install (HyperFrames is an optional dependency)",
};

export async function runTool(io: IO, name: keyof typeof guidance, command: string, args: string[], cwd?: string, sandbox?: { config: StudioConfig; workspace: string }): Promise<string> {
  const temp = mkdtempSync(join(tmpdir(), "bstudio-tool-"));
  try {
    const configured = Number(io.env.BSTUDIO_RENDER_TIMEOUT_MS);
    const timeoutMs = Number.isFinite(configured) && configured > 0 ? configured : (name === "vhs" || name === "hyperframes" ? 1_800_000 : 120_000);
    const wrapped = sandbox ? sandboxCommand(io, sandbox.config, sandbox.workspace, temp, command, args, { render: true, loopback: name === "vhs" || name === "hyperframes", pty: name === "vhs" }) : { command, args };
    const env = agentEnv(io, { temp, home: temp, minimal: true });
    if (name === "vhs" && wrapped.command !== command) env.VHS_NO_SANDBOX = "1";
    return await io.run(wrapped.command, wrapped.args, { cwd, env, timeoutMs });
  } catch (error) {
    throw new UserError(`${name} failed or is unavailable; run bstudio doctor; install: ${guidance[name]}. ${String(error)}`);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

export interface MediaProbe { width: number; height: number; seconds: number; bytes: number }

export async function probeMedia(file: string, io: IO): Promise<MediaProbe> {
  const text = await runTool(io, "ffprobe", "ffprobe", ["-v", "error", "-show_entries", "stream=width,height:format=duration", "-of", "json", file]);
  const data = JSON.parse(text) as { streams?: { width?: number; height?: number }[]; format?: { duration?: string } };
  const video = data.streams?.find(s => s.width && s.height);
  const seconds = Number(data.format?.duration);
  if (!video?.width || !video.height || !Number.isFinite(seconds) || seconds <= 0) throw new UserError(`ffprobe could not determine video dimensions and duration: ${file}`);
  return { width: video.width, height: video.height, seconds, bytes: statSync(file).size };
}

/** FFmpeg's filter parser has its own escaping, independent of shell quoting. */
function filterPath(path: string): string {
  return path.replace(/\\/g, "\\\\").replace(/'/g, "'\\''").replace(/:/g, "\\:").replace(/,/g, "\\,").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

export async function encodeVideo(input: string, output: string, io: IO, options: { captions?: string; voiceover?: string } = {}): Promise<void> {
  const args = ["-y", "-i", input];
  if (options.voiceover) {
    const streams = await runTool(io, "ffprobe", "ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "json", input]);
    const hasAudio = ((JSON.parse(streams) as { streams?: unknown[] }).streams ?? []).length > 0;
    args.push("-i", options.voiceover, "-map", "0:v:0");
    if (hasAudio) args.push("-filter_complex", "[1:a]apad[voice];[0:a][voice]amix=inputs=2:duration=first:normalize=0[audio]", "-map", "[audio]");
    else args.push("-map", "1:a:0", "-af", "apad", "-shortest");
  }
  if (options.captions) args.push("-vf", `subtitles=filename='${filterPath(options.captions)}'`);
  args.push("-c:v", options.captions ? "libx264" : "copy", ...(options.captions ? ["-pix_fmt", "yuv420p"] : []), "-movflags", "+faststart", "-c:a", "aac", output);
  try {
    await runTool(io, "ffmpeg", "ffmpeg", args);
  } catch (error) {
    if (options.captions && /No such filter: '?subtitles'?|filter not found/i.test(String(error))) {
      throw new UserError("FFmpeg lacks the subtitles filter (libass); install a libass-enabled FFmpeg, e.g. brew install ffmpeg-full, and run bstudio doctor");
    }
    throw error;
  }
}

export async function extractFrames(input: string, files: string[], seconds: number, io: IO): Promise<void> {
  for (let i = 0; i < files.length; i++) {
    const at = seconds * (i + 1) / (files.length + 1);
    await runTool(io, "ffmpeg", "ffmpeg", ["-y", "-ss", String(at), "-i", input, "-frames:v", "1", "-update", "1", files[i]]);
  }
}
