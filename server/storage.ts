import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { videoJobs, type VideoJob, type InsertVideoJob } from "@shared/schema";
import { eq } from "drizzle-orm";

const sqlite = new Database("data.db");
const db = drizzle(sqlite);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS video_jobs (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'pending',
    mode TEXT NOT NULL,
    song_name TEXT,
    effect TEXT,
    quality TEXT DEFAULT '720p',
    lyrics TEXT,
    output_file TEXT,
    error_msg TEXT,
    progress INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  )
`);

export interface IStorage {
  createJob(job: InsertVideoJob): VideoJob;
  getJob(id: string): VideoJob | undefined;
  updateJob(id: string, updates: Partial<VideoJob>): VideoJob | undefined;
  listJobs(): VideoJob[];
}

export const storage: IStorage = {
  createJob(job: InsertVideoJob): VideoJob {
    return db.insert(videoJobs).values(job).returning().get();
  },
  getJob(id: string): VideoJob | undefined {
    return db.select().from(videoJobs).where(eq(videoJobs.id, id)).get();
  },
  updateJob(id: string, updates: Partial<VideoJob>): VideoJob | undefined {
    return db.update(videoJobs).set(updates).where(eq(videoJobs.id, id)).returning().get();
  },
  listJobs(): VideoJob[] {
    return db.select().from(videoJobs).all();
  },
};
