import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const videoJobs = sqliteTable("video_jobs", {
  id: text("id").primaryKey(),
  status: text("status").notNull().default("pending"), // pending | processing | done | error
  mode: text("mode").notNull(), // "bild" | "slideshow" | "lyric"
  songName: text("song_name"),
  effect: text("effect"),
  quality: text("quality").default("720p"),
  lyrics: text("lyrics"),
  outputFile: text("output_file"),
  errorMsg: text("error_msg"),
  progress: integer("progress").default(0),
  createdAt: integer("created_at").notNull(),
});

export const insertVideoJobSchema = createInsertSchema(videoJobs).omit({
  outputFile: true,
  errorMsg: true,
  progress: true,
});

export type InsertVideoJob = z.infer<typeof insertVideoJobSchema>;
export type VideoJob = typeof videoJobs.$inferSelect;
