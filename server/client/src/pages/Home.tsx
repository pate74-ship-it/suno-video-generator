import { useState, useRef, useCallback, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { apiRequest } from "@/lib/queryClient";

type Mode = "bild" | "slideshow" | "lyric";

interface JobStatus {
  id: string;
  status: "pending" | "processing" | "done" | "error";
  progress: number;
  errorMsg?: string;
  songName?: string;
}

const YT_SPECS = [
  { label: "Auflösung", value: "1920 × 1080 (Full HD)", icon: "📐" },
  { label: "Seitenverhältnis", value: "16:9 (YouTube-Standard)", icon: "📺" },
  { label: "Bildrate", value: "30 fps", icon: "🎞️" },
  { label: "Video-Codec", value: "H.264 – High Profile, Level 4.0", icon: "🎬" },
  { label: "Video-Bitrate", value: "~10–15 Mbps (CRF 18)", icon: "⚡" },
  { label: "Max. Bitrate", value: "15.000 kbps (YouTube empfiehlt 8–15 Mbps)", icon: "📊" },
  { label: "Audio-Codec", value: "AAC-LC", icon: "🔊" },
  { label: "Audio-Bitrate", value: "320 kbps Stereo", icon: "🎵" },
  { label: "Sample-Rate", value: "48.000 Hz (YouTube-Standard)", icon: "🎚️" },
  { label: "Farbraum", value: "YUV 4:2:0 (yuv420p)", icon: "🎨" },
  { label: "Container", value: "MP4 mit faststart-Flag", icon: "📦" },
];

export default function Home() {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("bild");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [slideImages, setSlideImages] = useState<File[]>([]);
  const [songName, setSongName] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [quality, setQuality] = useState("youtube");
  const [effect, setEffect] = useState("none");
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showYtPanel, setShowYtPanel] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!jobId) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await apiRequest("GET", `/api/jobs/${jobId}`);
        const data: JobStatus = await res.json();
        setJobStatus(data);
        if (data.status === "done" || data.status === "error") {
          if (pollRef.current) clearInterval(pollRef.current);
          if (data.status === "done") {
            toast({ title: "Video fertig!", description: "Dein Musikvideo ist bereit zum Download." });
          } else {
            toast({ title: "Fehler", description: data.errorMsg || "Unbekannter Fehler", variant: "destructive" });
          }
        }
      } catch { /* ignore */ }
    }, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [jobId]);

  const handleAudioDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && (f.type.startsWith("audio/") || f.name.match(/\.(mp3|wav|ogg|m4a)$/i))) setAudioFile(f);
  }, []);

  const handleImageDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith("image/")) setImageFile(f);
  }, []);

  const handleSlideImagesDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    setSlideImages((prev) => [...prev, ...files]);
  }, []);

  const removeSlideImage = (idx: number) => setSlideImages((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    if (!audioFile) { toast({ title: "Fehler", description: "Bitte eine Musikdatei hochladen", variant: "destructive" }); return; }
    if (mode === "bild" && !imageFile) { toast({ title: "Fehler", description: "Bitte ein Hintergrundbild hochladen", variant: "destructive" }); return; }
    if (mode === "slideshow" && slideImages.length < 1) { toast({ title: "Fehler", description: "Bitte mindestens 1 Bild hochladen", variant: "destructive" }); return; }
    if (mode === "lyric" && !lyrics.trim()) { toast({ title: "Fehler", description: "Bitte Songtext eingeben", variant: "destructive" }); return; }

    setIsSubmitting(true);
    setJobId(null);
    setJobStatus(null);

    const fd = new FormData();
    fd.append("audio", audioFile);
    fd.append("mode", mode);
    fd.append("songName", songName || audioFile.name.replace(/\.[^.]+$/, ""));
    fd.append("quality", quality);
    fd.append("effect", effect);
    fd.append("lyrics", lyrics);
    if (mode === "bild" && imageFile) fd.append("image", imageFile);
    if (mode === "slideshow") slideImages.forEach((f) => fd.append("images", f));

    try {
      const res = await fetch("/api/jobs", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler");
      setJobId(data.jobId);
      setJobStatus({ id: data.jobId, status: "processing", progress: 5 });
      toast({ title: "Video wird erstellt...", description: "Server rendert dein Video. Bitte warten." });
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownload = () => { if (jobId) window.open(`/api/jobs/${jobId}/download`, "_blank"); };
  const handleReset = () => { setJobId(null); setJobStatus(null); setAudioFile(null); setImageFile(null); setSlideImages([]); setSongName(""); setLyrics(""); };

  const progressValue = jobStatus?.progress ?? 0;
  const isYoutube = quality === "youtube";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-lg">🎵</div>
          <div>
            <h1 className="text-base font-bold leading-tight">Suno Musikvideo-Generator</h1>
            <p className="text-xs text-muted-foreground">Server-Rendering mit ffmpeg</p>
          </div>
          <span className="ml-auto text-xs bg-green-500/20 text-green-400 border border-green-500/30 rounded-full px-2 py-0.5 font-mono">v2.1</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-5">

        {/* YouTube Export Banner */}
        <div
          onClick={() => setShowYtPanel(!showYtPanel)}
          className="rounded-xl border border-red-500/40 bg-red-500/5 p-4 cursor-pointer hover:bg-red-500/10 transition-colors"
          data-testid="yt-panel-toggle"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">▶</span>
              <div>
                <div className="font-semibold text-sm text-red-400">YouTube-optimierter Export</div>
                <div className="text-xs text-muted-foreground mt-0.5">1080p · H.264 · AAC 320k · 48 kHz · 16:9</div>
              </div>
            </div>
            <span className="text-muted-foreground text-lg">{showYtPanel ? "▲" : "▼"}</span>
          </div>

          {showYtPanel && (
            <div className="mt-4 border-t border-border pt-4" onClick={(e) => e.stopPropagation()}>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                Diese Einstellungen folgen den offiziellen YouTube-Empfehlungen für beste Upload-Qualität.
                Wähle <strong className="text-foreground">YouTube 1080p</strong> bei der Videoqualität.
              </p>
              <div className="space-y-2">
                {YT_SPECS.map((spec) => (
                  <div key={spec.label} className="flex items-start gap-3 text-xs">
                    <span className="w-5 flex-shrink-0">{spec.icon}</span>
                    <span className="text-muted-foreground w-32 flex-shrink-0">{spec.label}</span>
                    <span className="text-foreground font-medium">{spec.value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3 text-xs text-yellow-400 leading-relaxed">
                💡 <strong>Tipp:</strong> YouTube verarbeitet hochgeladene Videos nochmals intern. Mit diesen Einstellungen bleibt die Qualität nach der YouTube-Verarbeitung bestmöglich erhalten.
              </div>
            </div>
          )}
        </div>

        {/* Mode Selector */}
        <div>
          <Label className="text-sm font-semibold mb-3 block">Video-Modus</Label>
          <div className="grid grid-cols-3 gap-3">
            {([
              { id: "bild", icon: "🖼️", label: "Bild + Musik" },
              { id: "slideshow", icon: "🎞️", label: "Slideshow" },
              { id: "lyric", icon: "📝", label: "Lyric Video" },
            ] as const).map((m) => (
              <div key={m.id} data-testid={`mode-${m.id}`} onClick={() => setMode(m.id)} className={`mode-card ${mode === m.id ? "active" : ""}`}>
                <div className="text-2xl mb-1">{m.icon}</div>
                <div className="text-xs font-medium">{m.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Audio Upload */}
        <div>
          <Label className="text-sm font-semibold mb-2 block">🎵 Musik-Datei (MP3, WAV, OGG)</Label>
          <label data-testid="upload-audio" className={`upload-zone block ${audioFile ? "has-file" : ""}`} onDragOver={(e) => e.preventDefault()} onDrop={handleAudioDrop}>
            <input type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a" className="hidden" onChange={(e) => { if (e.target.files?.[0]) setAudioFile(e.target.files[0]); }} />
            {audioFile ? (
              <div className="text-green-400 font-medium text-sm">✓ {audioFile.name} ({(audioFile.size / 1024 / 1024).toFixed(1)} MB)</div>
            ) : (
              <div className="text-muted-foreground text-sm"><div className="text-2xl mb-2">🎵</div><div>Tippe hier um eine Datei zu wählen</div><div className="text-xs mt-1">oder ziehe sie hierher</div></div>
            )}
          </label>
        </div>

        {/* Image – Bild-Modus */}
        {mode === "bild" && (
          <div>
            <Label className="text-sm font-semibold mb-2 block">🖼️ Hintergrundbild (JPG, PNG, WEBP)</Label>
            <label data-testid="upload-image" className={`upload-zone block ${imageFile ? "has-file" : ""}`} onDragOver={(e) => e.preventDefault()} onDrop={handleImageDrop}>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) setImageFile(e.target.files[0]); }} />
              {imageFile ? (
                <div className="text-green-400 font-medium text-sm">✓ {imageFile.name}</div>
              ) : (
                <div className="text-muted-foreground text-sm"><div className="text-2xl mb-2">🖼️</div><div>Tippe hier um ein Bild zu wählen</div></div>
              )}
            </label>
          </div>
        )}

        {/* Slideshow */}
        {mode === "slideshow" && (
          <div>
            <Label className="text-sm font-semibold mb-2 block">🎞️ Bilder für Slideshow</Label>
            <label data-testid="upload-slides" className="upload-zone block" onDragOver={(e) => e.preventDefault()} onDrop={handleSlideImagesDrop}>
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { const files = Array.from(e.target.files || []); setSlideImages((prev) => [...prev, ...files]); }} />
              <div className="text-muted-foreground text-sm"><div className="text-2xl mb-2">🖼️</div><div>Bilder auswählen (mehrere möglich)</div></div>
            </label>
            {slideImages.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {slideImages.map((f, i) => (
                  <div key={i} className="relative">
                    <img src={URL.createObjectURL(f)} className="img-thumb" alt={f.name} />
                    <button onClick={() => removeSlideImage(i)} className="absolute -top-1 -right-1 w-5 h-5 bg-destructive rounded-full text-xs text-white flex items-center justify-center">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Lyric */}
        {mode === "lyric" && (
          <div>
            <Label className="text-sm font-semibold mb-2 block">📝 Songtext</Label>
            <Textarea data-testid="input-lyrics" placeholder="Gib hier deinen Songtext ein..." value={lyrics} onChange={(e) => setLyrics(e.target.value)} className="min-h-32 resize-none" />
          </div>
        )}

        {/* Settings */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-sm font-semibold mb-2 block">Videoqualität</Label>
            <Select value={quality} onValueChange={setQuality}>
              <SelectTrigger data-testid="select-quality">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="youtube">
                  <span className="flex items-center gap-2">▶ YouTube 1080p</span>
                </SelectItem>
                <SelectItem value="720p">720p HD</SelectItem>
              </SelectContent>
            </Select>
            {isYoutube && (
              <p className="text-xs text-red-400 mt-1.5">H.264 · 320k AAC · 48kHz · 16:9</p>
            )}
          </div>

          {mode === "bild" && (
            <div>
              <Label className="text-sm font-semibold mb-2 block">Bild-Effekt</Label>
              <Select value={effect} onValueChange={setEffect}>
                <SelectTrigger data-testid="select-effect"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Kein Effekt</SelectItem>
                  <SelectItem value="zoom">Langsamer Zoom</SelectItem>
                  <SelectItem value="panorama">Panorama</SelectItem>
                  <SelectItem value="pulse">Pulsieren</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Song Name */}
        <div>
          <Label className="text-sm font-semibold mb-2 block">Songname (für Dateiname)</Label>
          <Input data-testid="input-songname" placeholder="z.B. Seelenflüsterer – Mein Song" value={songName} onChange={(e) => setSongName(e.target.value)} />
        </div>

        {/* Submit / Progress / Download */}
        {!jobId ? (
          <Button
            data-testid="button-create"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`w-full h-12 text-base font-semibold glow-btn ${isYoutube ? "bg-red-600 hover:bg-red-500" : "bg-primary hover:bg-primary/90"}`}
          >
            {isSubmitting ? "Wird hochgeladen..." : isYoutube ? "▶ YouTube-Video erstellen" : "▶ Video erstellen"}
          </Button>
        ) : (
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">
                {jobStatus?.status === "done" ? "✅ Video fertig!" : jobStatus?.status === "error" ? "❌ Fehler" : "⏳ Video wird gerendert..."}
              </span>
              <span className="text-muted-foreground text-xs font-mono">{progressValue}%</span>
            </div>
            <Progress value={progressValue} className="h-3" />

            {jobStatus?.status === "processing" && (
              <p className="text-xs text-muted-foreground">
                {isYoutube ? "YouTube 1080p wird gerendert – dauert 2–4 Minuten je nach Songlänge." : "Server rendert dein Video – bitte kurz warten."}
              </p>
            )}

            {jobStatus?.status === "done" && (
              <div className="space-y-3">
                {isYoutube && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
                    ▶ <strong>YouTube-Ready:</strong> 1080p · H.264 · AAC 320k · 48kHz · 16:9 – direkt hochladbar auf YouTube.
                  </div>
                )}
                <div className="flex gap-3">
                  <Button data-testid="button-download" onClick={handleDownload} className="flex-1 bg-green-600 hover:bg-green-500 font-semibold">
                    ⬇ Video herunterladen
                  </Button>
                  <Button data-testid="button-new" onClick={handleReset} variant="outline" className="flex-1">
                    Neues Video
                  </Button>
                </div>
              </div>
            )}

            {jobStatus?.status === "error" && (
              <div className="space-y-3">
                <p className="text-xs text-destructive">{jobStatus.errorMsg}</p>
                <Button onClick={handleReset} variant="outline" className="w-full">Nochmal versuchen</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
