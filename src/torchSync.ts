/** 部分安卓 Chrome 可通过摄像头 track 控制 True Torch；iPhone Safari 通常不可用 */

let videoTrack: MediaStreamTrack | null = null;
let beatIv: ReturnType<typeof setInterval> | null = null;
let offT: ReturnType<typeof setTimeout> | null = null;
let enabled = false;

function clearTimers(): void {
  if (beatIv !== null) {
    clearInterval(beatIv);
    beatIv = null;
  }
  if (offT !== null) {
    clearTimeout(offT);
    offT = null;
  }
}

async function torchOn(): Promise<void> {
  if (!videoTrack) return;
  try {
    await videoTrack.applyConstraints({
      advanced: [{ torch: true }]
    } as unknown as MediaTrackConstraints);
  } catch {
    /* ignore */
  }
}

async function torchOff(): Promise<void> {
  if (!videoTrack) return;
  try {
    await videoTrack.applyConstraints({
      advanced: [{ torch: false }]
    } as unknown as MediaTrackConstraints);
  } catch {
    /* ignore */
  }
}

export function isTorchDriverEnabled(): boolean {
  return enabled;
}

export async function enableTorchDriver(): Promise<{ ok: boolean; message: string }> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, message: "当前环境无法打开摄像头。" };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });
    videoTrack = stream.getVideoTracks()[0];
    const caps = videoTrack.getCapabilities?.() as { torch?: boolean } | undefined;
    if (!caps?.torch) {
      disableTorchDriver();
      return {
        ok: false,
        message: "该设备/浏览器不支持网页控制闪光灯（iPhone 上常见）。请用「屏幕闪光」。"
      };
    }
    enabled = true;
    return {
      ok: true,
      message:
        "已开启。实时节拍模式下闪光灯跟着检测到的鼓点闪；否则按曲库 BPM 闪。iPhone 网页通常无法控制真闪光灯。"
    };
  } catch {
    disableTorchDriver();
    return { ok: false, message: "无法获取摄像头权限或被拒绝。" };
  }
}

export function disableTorchDriver(): void {
  enabled = false;
  clearTimers();
  clearDrumPulseTimers();
  if (flashHoldT !== null) {
    clearTimeout(flashHoldT);
    flashHoldT = null;
  }
  void torchOff();
  videoTrack?.stop();
  videoTrack = null;
}

/** 暂停节拍闪光灯（保持摄像头授权，稍后可再在播放时恢复） */
export function pauseTorchPulse(): void {
  clearTimers();
  clearDrumPulseTimers();
  void torchOff();
}

let flashHoldT: ReturnType<typeof setTimeout> | null = null;
const drumPulseTimers: ReturnType<typeof setTimeout>[] = [];

function clearDrumPulseTimers(): void {
  for (const t of drumPulseTimers) clearTimeout(t);
  drumPulseTimers.length = 0;
}

/** 单次闪光（元数据 BPM 模式下的周期闪灯片段） */
export function torchBeatFlash(durationMs = 95): void {
  if (!enabled || !videoTrack) return;
  clearDrumPulseTimers();
  if (flashHoldT !== null) {
    clearTimeout(flashHoldT);
    flashHoldT = null;
  }
  void torchOn();
  flashHoldT = setTimeout(() => {
    void torchOff();
    flashHoldT = null;
  }, durationMs);
}

/**
 * 随鼓点「振一下」：亮→灭，强拍再补一小脉冲（更像跟着鼓沿）。
 * 仅在实时节拍回调里使用。
 */
export function torchDrumPulse(strength01: number): void {
  if (!enabled || !videoTrack) return;
  clearDrumPulseTimers();
  if (flashHoldT !== null) {
    clearTimeout(flashHoldT);
    flashHoldT = null;
  }

  const onMs = 42 + strength01 * 78;
  const gapMs = 18 + strength01 * 22;

  const q = (fn: () => void, ms: number) => {
    drumPulseTimers.push(setTimeout(fn, ms));
  };

  q(() => void torchOn(), 0);
  q(() => void torchOff(), onMs);

  if (strength01 > 0.42) {
    q(() => void torchOn(), onMs + gapMs);
    q(() => void torchOff(), onMs + gapMs + (26 + strength01 * 48));
  }
}

/** 按当前 BPM 同步闪光灯频率（毫秒节拍） */
export function syncTorchToBpm(bpm: number): void {
  clearTimers();
  clearDrumPulseTimers();
  if (!enabled || !videoTrack) return;

  const ms = Math.round(60000 / Math.min(Math.max(bpm, 40), 220));
  const flashMs = Math.min(140, Math.max(45, Math.floor(ms * 0.12)));

  void torchOff();

  const pulse = (): void => {
    void (async () => {
      await torchOn();
      if (offT !== null) clearTimeout(offT);
      offT = setTimeout(() => {
        void torchOff();
      }, flashMs);
    })();
  };

  pulse();
  beatIv = setInterval(pulse, ms);
}
