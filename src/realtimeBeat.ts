/**
 * 低频加权谱通量 + 时域能量上升沿，更高频采样（≈60Hz）以贴近鼓点 transient。
 */

export type RealtimeBeatCallbacks = {
  onBeat: (strength01: number) => void;
  onLowEnergy?: (level01: number) => void;
  onEstimatedBpm?: (bpm: number | null) => void;
};

export function startRealtimeBeat(
  analyser: AnalyserNode,
  callbacks: RealtimeBeatCallbacks
): () => void {
  const freq = new Uint8Array(analyser.frequencyBinCount);
  const prevFreq = new Uint8Array(analyser.frequencyBinCount);
  prevFreq.fill(0);

  const td = new Float32Array(analyser.fftSize);
  let prevRms = 0;

  const fluxWin: number[] = [];
  const gapMs: number[] = [];

  let lastBeatAt = 0;
  let prevBeatAt = 0;
  let lastFluxPeak = 0;
  let iv = 0;
  let stopped = false;

  const sr = analyser.context.sampleRate;
  const hzPerBin = sr / analyser.fftSize;
  const iLow = Math.max(2, Math.floor(36 / hzPerBin));
  const iHigh = Math.min(analyser.frequencyBinCount - 1, Math.floor(320 / hzPerBin));

  const tick = (): void => {
    if (stopped) return;

    analyser.getByteFrequencyData(freq);
    analyser.getFloatTimeDomainData(td);

    let rms = 0;
    for (let i = 0; i < td.length; i++) {
      rms += td[i] * td[i];
    }
    rms = Math.sqrt(rms / td.length);
    const envDelta = Math.max(0, rms - prevRms) * 380;
    prevRms = prevRms * 0.82 + rms * 0.18;

    let flux = 0;
    let band = 0;
    for (let i = iLow; i <= iHigh; i++) {
      const hz = i * hzPerBin;
      const w = hz >= 52 && hz <= 148 ? 2.4 : hz <= 240 ? 1.15 : 0.85;
      const d = freq[i] - prevFreq[i];
      if (d > 0) flux += w * d * d;
      band += freq[i];
    }
    flux = Math.sqrt(flux / (iHigh - iLow + 1));
    const envBoost = Math.min(55, envDelta);
    const combined = flux * 0.72 + envBoost;

    const lowEnergy = band / (255 * (iHigh - iLow + 1));
    callbacks.onLowEnergy?.(Math.min(1, lowEnergy * 2.4));

    prevFreq.set(freq);

    fluxWin.push(combined);
    if (fluxWin.length > 36) fluxWin.shift();
    const sorted = [...fluxWin].sort((a, b) => a - b);
    const q = sorted[Math.floor(sorted.length * 0.68)] ?? 0;
    const threshold = Math.max(11, q * 1.95 + lastFluxPeak * 0.1);

    const now = performance.now();

    const recentGap =
      gapMs.length > 0 ? gapMs[gapMs.length - 1] ?? 400 : 400;
    const minGap = Math.max(135, Math.min(290, recentGap * 0.42));

    if (combined > threshold && combined > 15 && now - lastBeatAt > minGap) {
      const strength = Math.min(1, combined / 95);
      lastBeatAt = now;
      lastFluxPeak = combined * 0.38 + lastFluxPeak * 0.62;

      callbacks.onBeat(strength);

      if (prevBeatAt > 0) {
        const g = now - prevBeatAt;
        if (g > 240 && g < 1220) {
          gapMs.push(g);
          while (gapMs.length > 14) gapMs.shift();
          if (gapMs.length >= 4) {
            const sortedG = [...gapMs].sort((a, b) => a - b);
            const med = sortedG[Math.floor(sortedG.length / 2)] ?? 500;
            const bpm = Math.round(60000 / med);
            if (bpm >= 68 && bpm <= 195) {
              callbacks.onEstimatedBpm?.(bpm);
            }
          }
        }
      }
      prevBeatAt = now;
    }
  };

  iv = window.setInterval(tick, 14);

  return () => {
    stopped = true;
    window.clearInterval(iv);
  };
}
