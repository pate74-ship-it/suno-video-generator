import type { Express } from "express";
import type { Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { v4 as uuidv4 } from "uuid";
import { storage } from "./storage";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const OUTPUT_DIR = path.join(process.cwd(), "outputs");

[UPLOADS_DIR, OUTPUT_DIR].forEach((d) => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 500 * 1024 * 1024 },
});

// YouTube-recommended encoding settings
// Source: https://support.google.com/youtube/answer/1722171
const YT_SETTINGS = {
  width: 1920,
  height: 1080,
  fps: 30,
  vcodec: "libx264",
  profile: "high",
  level: "4.0",
  crf: "18",           // visually lossless, ~10-15 Mbps for 1080p
  maxrate: "15000k",
  bufsize: "30000k",
  preset: "slow",      // better compression
  pix_fmt: "yuv420p",
  acodec: "aac",
  ab: "320k",          // YouTube recommends 384k max, 320k is ideal
  ar: "48000",         // 48 kHz sample rate (YouTube standard)
  movflags: "+faststart",
};

// Standard settings (720p)
const STD_SETTINGS = {
  width: 1280,
  height: 720,
  fps: 30,
  vcodec: "libx264",
  profile: "high",
  level: "3.1",
  crf: "23",
  maxrate: "5000k",
  bufsize: "10000k",
  preset: "medium",
  pix_fmt: "yuv420p",
  acodec: "aac",
  ab: "192k",
  ar: "44100",
  movflags: "+faststart",
};

function getSettings(quality: string) {
  return quality === "youtube" || quality === "1080p" ? YT_SETTINGS : STD_SETTINGS;
}

function scaleFilter(s: typeof YT_SETTINGS) {
  return `scale=${s.width}:${s.height}:force_original_aspect_ratio=decrease,pad=${s.width}:${s.height}:(ow-iw)/2:(oh-ih)/2,setsar=1`;
}

function commonVideoArgs(s: typeof YT_SETTINGS): string[] {
  return [
    "-c:v", s.vcodec,
    "-profile:v", s.profile,
    "-level", s.level,
    "-crf", s.crf,
    "-maxrate", s.maxrate,
    "-bufsize", s.bufsize,
    "-preset", s.preset,
    "-pix_fmt", s.pix_fmt,
    "-c:a", s.acodec,
    "-b:a", s.ab,
    "-ar", s.ar,
    "-movflags", s.movflags,
    "-shortest",
    "-y",
  ];
}

function buildBildCmd(audioPath: string, imagePath: string, outputPath: string, quality: string, effect: string): string[] {
  const s = getSettings(quality);

  let vf = scaleFilter(s);
  if (effect === "zoom") {
    vf = `scale=8000:-1,zoompan=z='min(zoom+0.0015,1.5)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${s.width}x${s.height}:fps=${s.fps},setsar=1`;
  } else if (effect === "panorama") {
    vf = `scale=-1:${s.height},crop=${s.width}:${s.height}:'min(t*${s.fps},iw-${s.width})':0,setsar=1`;
  } else if (effect === "pulse") {
    vf = `scale=8000:-1,zoompan=z='1.05+0.05*sin(on/30*2*PI)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${s.width}x${s.height}:fps=${s.fps},setsar=1`;
  }

  return [
    "-loop", "1",
    "-i", imagePath,
    "-i", audioPath,
    "-vf", vf,
    ...commonVideoArgs(s),
    outputPath,
  ];
}

function buildSlideshowCmd(audioPath: string, imagePaths: string[], outputPath: string, quality: string): string[] {
  const s = getSettings(quality);
  const duration = 5;
  const inputs: string[] = [];
  imagePaths.forEach((p) => {
    inputs.push("-loop", "1", "-t", String(duration), "-i", p);
  });

  const filterParts: string[] = [];
  imagePaths.forEach((_, i) => {
    filterParts.push(`[${i}:v]${scaleFilter(s)},fps=${s.fps}[v${i}]`);
  });
  const concatInputs = imagePaths.map((_, i) => `[v${i}]`).join("");
  filterParts.push(`${concatInputs}concat=n=${imagePaths.length}:v=1:a=0[vout]`);

  return [
    ...inputs,
    "-i", audioPath,
    "-filter_complex", filterParts.join(";"),
    "-map", "[vout]",
    "-map", `${imagePaths.length}:a`,
    ...commonVideoArgs(s),
    outputPath,
  ];
}

function buildLyricCmd(audioPath: string, lyrics: string, outputPath: string, quality: string): string[] {
  const s = getSettings(quality);
  const lyricsFile = path.join(UPLOADS_DIR, uuidv4() + ".txt");
  const lines = lyrics.split("\n").slice(0, 30).join("\n");
  fs.writeFileSync(lyricsFile, lines, "utf8");

  const vf = `color=black:${s.width}x${s.height}:rate=${s.fps}[bg];[bg]drawtext=textfile='${lyricsFile}':fontcolor=white:fontsize=${s.width > 1280 ? 42 : 32}:x=(w-text_w)/2:y=(h-text_h)/2:line_spacing=12[vout]`;

  return [
    "-f", "lavfi",
    "-i", `color=black:${s.width}x${s.height}:rate=${s.fps}`,
    "-i", audioPath,
    "-filter_complex", vf,
    "-map", "[vout]",
    "-map", "1:a",
    ...commonVideoArgs(s),
    outputPath,
  ];
}

function runFfmpeg(args: string[], jobId: string): void {
  const proc = spawn("ffmpeg", args);
  let stderr = "";

  proc.stderr.on("data", (data: Buffer) => {
    stderr += data.toString();
    const timeMatch = stderr.match(/time=(\d+):(\d+):(\d+)/g);
    if (timeMatch && timeMatch.length > 0) {
      const last = timeMatch[timeMatch.length - 1];
      const m = last.match(/time=(\d+):(\d+):(\d+)/);
      if (m) {
        const secs = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]);
        const prog = Math.min(99, Math.round(secs / 2));
        storage.updateJob(jobId, { progress: prog });
      }
    }
  });

  proc.on("close", (code: number) => {
    if (code === 0) {
      storage.updateJob(jobId, { status: "done", progress: 100 });
    } else {
      storage.updateJob(jobId, { status: "error", errorMsg: stderr.slice(-600), progress: 0 });
    }
  });
}

export function registerRoutes(httpServer: Server, app: Express): void {
  app.post(
    "/api/jobs",
    upload.fields([
      { name: "audio", maxCount: 1 },
      { name: "image", maxCount: 1 },
      { name: "images", maxCount: 20 },
    ]),
    (req, res) => {
      try {
        const files = req.files as Record<string, Express.Multer.File[]>;
        const { mode, songName, effect, quality, lyrics } = req.body;

        if (!files?.audio?.[0]) {
          res.status(400).json({ error: "Keine Audiodatei hochgeladen" });
          return;
        }

        const jobId = uuidv4();
        const outputFile = path.join(OUTPUT_DIR, `${jobId}.mp4`);
        const audioPath = files.audio[0].path;

        storage.createJob({
          id: jobId,
          status: "processing",
          mode,
          songName: songName || "Video",
          effect: effect || "none",
          quality: quality || "720p",
          lyrics: lyrics || "",
          createdAt: Date.now(),
        });

        storage.updateJob(jobId, { outputFile });

        let args: string[] = [];

        if (mode === "bild") {
          if (!files?.image?.[0]) {
            res.status(400).json({ error: "Kein Bild hochgeladen" });
            return;
          }
          args = buildBildCmd(audioPath, files.image[0].path, outputFile, quality || "720p", effect || "none");
        } else if (mode === "slideshow") {
          const imgPaths = (files?.images || []).map((f) => f.path);
          if (imgPaths.length < 1) {
            res.status(400).json({ error: "Keine Bilder für Slideshow hochgeladen" });
            return;
          }
          args = buildSlideshowCmd(audioPath, imgPaths, outputFile, quality || "720p");
        } else if (mode === "lyric") {
          args = buildLyricCmd(audioPath, lyrics || "", outputFile, quality || "720p");
        } else {
          res.status(400).json({ error: "Unbekannter Modus" });
          return;
        }

        runFfmpeg(args, jobId);
        res.json({ jobId, status: "processing" });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  app.get("/api/jobs/:id", (req, res) => {
    const job = storage.getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Job nicht gefunden" });
      return;
    }
    res.json(job);
  });

  app.get("/api/jobs/:id/download", (req, res) => {
    const job = storage.getJob(req.params.id);
    if (!job || job.status !== "done" || !job.outputFile) {
      res.status(404).json({ error: "Video nicht bereit" });
      return;
    }
    const filename = `${job.songName || "video"}.mp4`.replace(/[^a-zA-Z0-9äöüÄÖÜß._-]/g, "_");
    res.download(job.outputFile, filename);
  });
}
