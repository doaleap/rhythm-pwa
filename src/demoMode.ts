/** 无 Spotify 时：用查询字符串生成稳定的演示用 BPM / 能量 */
export function deriveDemoFeatures(query: string): {
  bpm: number;
  energy: number;
} {
  const s = query.trim().toLowerCase();
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = (n: number) => ((h >>> n) & 0xffff) / 0xffff;
  const bpm = 72 + Math.floor(u(0) * 95);
  const energy = 0.15 + u(16) * 0.83;
  return { bpm, energy };
}
