/** 单曲试听；接入 Web Audio 以便实时分析（需音频跨域允许 CORS） */

const audio = new Audio();
audio.preload = "none";

let audioCtx: AudioContext | null = null;
let mediaSrc: MediaElementAudioSourceNode | null = null;
let analyserNode: AnalyserNode | null = null;

export function pausePreview(): void {
  audio.pause();
}

export function isPreviewPlaying(): boolean {
  return !audio.paused;
}

export function getAnalyser(): AnalyserNode | null {
  return analyserNode;
}

export function isRealtimeAnalysisAvailable(): boolean {
  return analyserNode !== null;
}

/**
 * 构建 MediaElement → Analyser → 扬声器。失败时仍可走底层播放，但无分析。
 */
export async function ensureAudioGraph(): Promise<boolean> {
  if (analyserNode) return true;

  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;

    audioCtx = new AudioContext();
    mediaSrc = audioCtx.createMediaElementSource(audio);
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 1024;
    analyserNode.smoothingTimeConstant = 0.28;
    analyserNode.minDecibels = -90;
    analyserNode.maxDecibels = -20;

    mediaSrc.connect(analyserNode);
    analyserNode.connect(audioCtx.destination);
    return true;
  } catch {
    analyserNode = null;
    mediaSrc = null;
    if (audioCtx) {
      void audioCtx.close();
      audioCtx = null;
    }
    return false;
  }
}

async function resumeContext(): Promise<void> {
  if (audioCtx?.state === "suspended") {
    await audioCtx.resume();
  }
}

export async function playPreviewUrl(url: string | null): Promise<boolean> {
  if (!url?.trim()) return false;
  try {
    audio.pause();
    audio.crossOrigin = "anonymous";
    audio.src = url;

    await ensureAudioGraph();
    await resumeContext();

    await audio.play();
    return true;
  } catch {
    return false;
  }
}

export function onPreviewPlaybackChange(handler: () => void): () => void {
  audio.addEventListener("ended", handler);
  audio.addEventListener("pause", handler);
  audio.addEventListener("playing", handler);
  return () => {
    audio.removeEventListener("ended", handler);
    audio.removeEventListener("pause", handler);
    audio.removeEventListener("playing", handler);
  };
}
