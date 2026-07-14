import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { promises as fs, createReadStream } from "fs";
import { Readable } from "stream";
import os from "os";
import path from "path";
import { spawn } from "child_process";

// Genera (y cachea) un clip de preview LIVIANO de cada reel: 360px de ancho,
// primeros 6s, sin audio (~100-200KB). El navegador/iPhone solo baja eso en vez
// de los ~2-3MB del reel original → el hover carga casi instantáneo. El primer
// pedido transcodifica con ffmpeg en la Mac; los siguientes salen del caché.

export const runtime = "nodejs";

const ALLOWED_HOSTS = /^(.*\.)?(cdninstagram\.com|fbcdn\.net)$/i;
const CACHE_DIR = path.join(os.tmpdir(), "iv-previews");
const FFMPEG = process.env.FFMPEG_PATH || "/opt/homebrew/bin/ffmpeg";

// Evita transcodificar el mismo reel dos veces en paralelo.
const inflight = new Map<string, Promise<string>>();

function spawnFfmpeg(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const ff = spawn(bin, args, { stdio: ["ignore", "ignore", "ignore"] });
    const killer = setTimeout(() => ff.kill("SIGKILL"), 25_000); // no colgarse
    ff.on("error", reject);
    ff.on("close", (c) => {
      clearTimeout(killer);
      c === 0 ? resolve() : reject(new Error("ffmpeg exit " + c));
    });
  });
}

async function runFfmpeg(args: string[]): Promise<void> {
  try {
    await spawnFfmpeg(FFMPEG, args);
  } catch (e) {
    if ((e as any).code === "ENOENT" && FFMPEG !== "ffmpeg") {
      await spawnFfmpeg("ffmpeg", args); // fallback al PATH
    } else throw e;
  }
}

async function ensurePreview(url: string): Promise<string> {
  // El sufijo "|a1" versiona el caché: al cambiar la receta de ffmpeg (ahora con
  // audio) los clips viejos sin sonido no se reutilizan.
  const hash = createHash("sha1").update(url + "|a1").digest("hex");
  const out = path.join(CACHE_DIR, hash + ".mp4");
  try {
    await fs.access(out);
    return out;
  } catch {}
  if (inflight.has(hash)) return inflight.get(hash)!;

  const job = (async () => {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const src = path.join(CACHE_DIR, hash + ".src");
    // 1) descargar el reel original (server-side, con headers de IG).
    //    Con timeout: si la URL caducó, falla rápido en vez de colgarse.
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 20_000);
    let res: Response;
    try {
      res = await fetch(url, {
        signal: ac.signal,
        headers: {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: "*/*",
        },
      });
    } finally {
      clearTimeout(t);
    }
    if (!res.ok && res.status !== 206) throw new Error("fuente " + res.status);
    await fs.writeFile(src, Buffer.from(await res.arrayBuffer()));
    // 2) transcodificar a clip liviano
    await runFfmpeg([
      "-y", "-i", src,
      "-t", "6",
      "-vf", "scale=360:-2",
      "-c:v", "libx264",
      "-crf", "30",
      "-preset", "veryfast",
      "-c:a", "aac",
      "-b:a", "96k",
      "-movflags", "+faststart",
      out,
    ]);
    await fs.unlink(src).catch(() => {});
    return out;
  })();

  inflight.set(hash, job);
  try {
    return await job;
  } finally {
    inflight.delete(hash);
  }
}

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get("url");
  if (!target) return new Response("Missing url", { status: 400 });
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return new Response("Invalid url", { status: 400 });
  }
  if (!ALLOWED_HOSTS.test(parsed.hostname)) {
    return new Response("Forbidden host", { status: 403 });
  }

  let file: string;
  try {
    file = await ensurePreview(target);
  } catch (e) {
    console.error("preview error:", e);
    return new Response("Preview error", { status: 502 });
  }

  const stat = await fs.stat(file);
  const range = req.headers.get("range");
  const baseHeaders: Record<string, string> = {
    "content-type": "video/mp4",
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=604800",
  };

  if (range) {
    const m = /bytes=(\d+)-(\d*)/.exec(range);
    const start = m ? parseInt(m[1], 10) : 0;
    const end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
    const stream = createReadStream(file, { start, end });
    return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
      status: 206,
      headers: {
        ...baseHeaders,
        "content-range": `bytes ${start}-${end}/${stat.size}`,
        "content-length": String(end - start + 1),
      },
    });
  }

  const stream = createReadStream(file);
  return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
    headers: { ...baseHeaders, "content-length": String(stat.size) },
  });
}
