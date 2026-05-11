/** BPM → 色相漂移速度；能量 → 饱和度与对比 */
export function cssVarsFromFeatures(bpm: number, energy: number): Record<string, string> {
  const e = Math.min(1, Math.max(0, energy));
  const beatMs = Math.round(60000 / Math.min(Math.max(bpm, 40), 220));
  const hueBase = ((((bpm - 60) * 2.2) % 360) + 360) % 360;
  const sat = 55 + e * 38;
  const lightLow = 12 + (1 - e) * 10;
  const lightHigh = 42 + e * 28;

  /** 与音乐节拍同步闪光时使用（仅试听播放中可见），偏高以便感知节拍 */
  const flashOp = (0.38 + e * 0.34).toFixed(3);
  const thump = (1.004 + e * 0.034).toFixed(4);

  return {
    "--beat-ms": `${beatMs}ms`,
    "--flash-opacity": flashOp,
    "--bg-thump-scale": thump,
    "--hue-base": `${hueBase % 360}`,
    "--sat": `${sat}%`,
    "--light-a": `${lightLow}%`,
    "--light-b": `${lightHigh}%`,
    "--pulse-scale": `${1 + e * 0.06}`,
    "--glow": `${8 + e * 28}px`
  };
}
