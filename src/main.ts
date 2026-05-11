import "./styles.css";
import { cssVarsFromFeatures } from "./colors";
import { deriveDemoFeatures } from "./demoMode";
import { searchItunesPreviews } from "./itunes";
import {
  getAnalyser,
  isPreviewPlaying,
  isRealtimeAnalysisAvailable,
  onPreviewPlaybackChange,
  pausePreview,
  playPreviewUrl
} from "./previewAudio";
import { startRealtimeBeat } from "./realtimeBeat";
import {
  beginSpotifyLogin,
  clearSpotifyTokens,
  ensureAccessToken,
  getStoredAccessToken,
  handleSpotifyRedirect,
  searchTracks
} from "./spotify";
import {
  disableTorchDriver,
  enableTorchDriver,
  isTorchDriverEnabled,
  pauseTorchPulse,
  syncTorchToBpm,
  torchDrumPulse
} from "./torchSync";

import { registerSW } from "virtual:pwa-register";

registerSW({ immediate: true });

function requireAppRoot(): HTMLDivElement {
  const el = document.querySelector<HTMLDivElement>("#app");
  if (!el) throw new Error("#app missing");
  return el;
}

const root = requireAppRoot();

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  html?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html) node.innerHTML = html;
  return node;
}

function applyFeatures(bpm: number, energy: number, label: string): void {
  const root = document.documentElement;
  const vars = cssVarsFromFeatures(bpm, energy);
  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v);
  }
  const metaBpm = document.getElementById("meta-bpm");
  const metaEn = document.getElementById("meta-energy");
  const metaSong = document.getElementById("meta-song");
  if (metaBpm) metaBpm.textContent = String(bpm);
  if (metaEn) metaEn.textContent = energy.toFixed(2);
  if (metaSong) metaSong.textContent = label;
}

function render(): void {
  let liveBpm = 108;

  function pulseSync(bpm: number, energy: number, label: string): void {
    liveBpm = bpm;
    applyFeatures(bpm, energy, label);
    if (!isPreviewPlaying() || !isTorchDriverEnabled()) return;
    if (chkRealtime.checked && isRealtimeAnalysisAvailable()) {
      pauseTorchPulse();
      return;
    }
    syncTorchToBpm(liveBpm);
  }

  root.innerHTML = "";
  const shell = el("div", "shell");
  const bg = el("div", "bg-layer");
  const ring = el("div", "pulse-ring");
  const flashVeil = el("div", "flash-veil");
  const card = el("div", "card");

  const titleRow = el("div", "title-row");
  titleRow.append(el("h1", "", "Rhythm Mood"), el("span", "badge", "PWA"));

  const sub = el(
    "p",
    "sub",
    "搜索并播放试听片段后，背景震动与闪光才会按节拍启动（暂停即停）。完整版需在 App 内收听。"
  );

  const form = el("form", "search-form");
  const row = el("div", "search-row");
  const input = el("input") as HTMLInputElement;
  input.type = "search";
  input.name = "q";
  input.placeholder = "例如：Anti-Hero";
  input.autocomplete = "off";
  input.enterKeyHint = "search";

  const submitBtn = el("button", "btn", "搜索") as HTMLButtonElement;
  submitBtn.type = "submit";
  row.append(input, submitBtn);
  form.append(row);

  const btnRow = el("div", "btn-row");
  const spotifyBtn = el("button", "btn btn-ghost btn-small", "") as HTMLButtonElement;
  const hasToken = !!getStoredAccessToken();
  spotifyBtn.textContent = hasToken ? "已连接 Spotify" : "连接 Spotify（真实 BPM）";
  const logoutBtn = el("button", "btn btn-ghost btn-small", "清除登录") as HTMLButtonElement;
  logoutBtn.type = "button";
  logoutBtn.hidden = !hasToken;
  btnRow.append(spotifyBtn, logoutBtn);

  const fxRow = el("div", "fx-row");
  const chkBg = el("input") as HTMLInputElement;
  chkBg.type = "checkbox";
  chkBg.checked = true;
  const lblBg = el("label");
  lblBg.append(chkBg, document.createTextNode("背景随鼓点震动（播放时）"));
  const chkFlash = el("input") as HTMLInputElement;
  chkFlash.type = "checkbox";
  chkFlash.checked = true;
  const lblFlash = el("label");
  lblFlash.append(chkFlash, document.createTextNode("屏幕闪光（跟节拍）"));
  const chkRealtime = el("input") as HTMLInputElement;
  chkRealtime.type = "checkbox";
  chkRealtime.checked = true;
  const lblRt = el("label");
  lblRt.append(chkRealtime, document.createTextNode("实时音频节拍"));
  const torchBtn = el("button", "btn btn-ghost btn-small", "硬件闪光灯（实验）") as HTMLButtonElement;
  torchBtn.type = "button";

  let stopRealtimeLoop: (() => void) | null = null;

  function killRealtimeLoop(): void {
    stopRealtimeLoop?.();
    stopRealtimeLoop = null;
  }

  function triggerBeatVisual(strength: number): void {
    if (!shell.classList.contains("shell--playing") || !shell.classList.contains("shell--realtime")) {
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const foRaw = getComputedStyle(document.documentElement).getPropertyValue("--flash-opacity").trim();
    const fo = parseFloat(foRaw) || 0.55;

    if (chkFlash.checked) {
      flashVeil.animate(
        [{ opacity: 0 }, { opacity: Math.min(0.92, fo * (0.88 + strength * 0.35)) }, { opacity: 0 }],
        { duration: 105 + strength * 75, easing: "ease-out" }
      );
    }

    if (chkBg.checked) {
      const sc = 1.005 + strength * 0.042;
      bg.animate(
        [{ transform: "scale(1)" }, { transform: `scale(${sc})` }, { transform: "scale(1)" }],
        { duration: 128, easing: "cubic-bezier(0.25,0.9,0.35,1)" }
      );
      ring.animate([{ opacity: 0.62 }, { opacity: 1 }, { opacity: 0.76 }], {
        duration: 145,
        easing: "ease-out"
      });
    }

    if (isTorchDriverEnabled()) {
      torchDrumPulse(strength);
    }
  }

  function syncFxShell(): void {
    shell.classList.toggle("shell--mute-bg", !chkBg.checked);
    shell.classList.toggle("shell--mute-flash", !chkFlash.checked);
  }

  chkBg.addEventListener("change", syncFxShell);
  chkFlash.addEventListener("change", syncFxShell);
  chkRealtime.addEventListener("change", () => {
    killRealtimeLoop();
    syncPlayerUi();
  });

  torchBtn.addEventListener("click", async () => {
    if (isTorchDriverEnabled()) {
      disableTorchDriver();
      torchBtn.textContent = "硬件闪光灯（实验）";
      hint.textContent = "已关闭硬件闪光灯。";
      return;
    }
    const r = await enableTorchDriver();
    hint.textContent = r.message;
    if (r.ok) {
      torchBtn.textContent = "关闭硬件闪光灯";
      if (isPreviewPlaying() && !shell.classList.contains("shell--realtime")) {
        syncTorchToBpm(liveBpm);
      }
    }
  });

  fxRow.append(lblBg, lblFlash, lblRt, torchBtn);

  const listHost = el("div");

  const playerBar = el("div", "player-bar");
  playerBar.id = "player-bar";
  const playerLabel = el("span", "", "试听播放中…");
  const pauseBtn = el("button", "btn-tiny", "暂停") as HTMLButtonElement;
  pauseBtn.type = "button";
  playerBar.append(playerLabel, pauseBtn);

  let previewTitle = "";
  function syncPlayerUi(): void {
    const on = isPreviewPlaying();
    shell.classList.toggle("shell--playing", on);
    playerBar.classList.toggle("visible", on);

    if (on) {
      playerLabel.textContent = previewTitle ? `试听：${previewTitle}` : "试听播放中…";

      const wantRt = chkRealtime.checked && isRealtimeAnalysisAvailable();
      if (wantRt) {
        const an = getAnalyser();
        if (an) {
          shell.classList.add("shell--realtime");
          if (!stopRealtimeLoop) {
            stopRealtimeLoop = startRealtimeBeat(an, {
              onBeat: (s) => triggerBeatVisual(s),
              onEstimatedBpm: (bpm) => {
                const liveEl = document.getElementById("meta-live-bpm");
                if (liveEl) liveEl.textContent = bpm != null ? String(bpm) : "—";
              }
            });
          }
          pauseTorchPulse();
        } else {
          shell.classList.remove("shell--realtime");
          killRealtimeLoop();
          if (isTorchDriverEnabled()) syncTorchToBpm(liveBpm);
        }
      } else {
        shell.classList.remove("shell--realtime");
        killRealtimeLoop();
        const liveEl = document.getElementById("meta-live-bpm");
        if (liveEl) liveEl.textContent = "—";
        if (isTorchDriverEnabled()) syncTorchToBpm(liveBpm);
      }
    } else {
      killRealtimeLoop();
      shell.classList.remove("shell--realtime");
      pauseTorchPulse();
      const liveEl = document.getElementById("meta-live-bpm");
      if (liveEl) liveEl.textContent = "—";
    }
  }
  onPreviewPlaybackChange(syncPlayerUi);
  pauseBtn.addEventListener("click", () => {
    pausePreview();
    syncPlayerUi();
  });

  const hint = el(
    "p",
    "hint",
    "节拍闪光仅在试听播放中生效。未登录：iTunes 试听 + 演示 BPM；已登录：Spotify 真实特征 + 试听。"
  );

  const metaStrip = el("div", "meta-strip");
  metaStrip.innerHTML = `
    <span>曲目 <strong id="meta-song">—</strong></span>
    <span>曲库 BPM <strong id="meta-bpm">—</strong></span>
    <span>侦测 BPM <strong id="meta-live-bpm">—</strong></span>
    <span>能量 <strong id="meta-energy">—</strong></span>
  `;

  const footer = el(
    "footer",
    "setup",
    "部署到 HTTPS 后，在 iPhone Safari 用「分享 → 添加到主屏幕」。详见项目内的 DEPLOY.md。"
  );

  card.append(titleRow, sub, form, btnRow, fxRow, listHost, playerBar, hint, metaStrip, footer);
  shell.append(bg, ring, flashVeil, card);
  root.append(shell);

  syncFxShell();
  pulseSync(108, 0.62, "就绪");

  async function tryPlayPreview(url: string | null, title: string): Promise<void> {
    previewTitle = title;
    killRealtimeLoop();
    shell.classList.remove("shell--realtime");
    const ok = await playPreviewUrl(url);
    syncPlayerUi();
    if (!ok && url) {
      hint.textContent = "试听无法播放（可能被浏览器拦截），请再点一次或检查静音。";
    } else if (!url) {
      hint.textContent =
        "该条目暂无官方试听片段（很常见）。换一首歌或换搜索结果试试。";
    } else if (ok && chkRealtime.checked && !isRealtimeAnalysisAvailable()) {
      hint.textContent =
        "无法建立音频分析（多为跨域限制），已自动用曲库 BPM 做节拍。取消勾选「实时音频节拍」可只看元数据效果。";
    } else if (ok && chkRealtime.checked && isRealtimeAnalysisAvailable()) {
      hint.textContent =
        "实时分析已启用：闪光与震动跟随试听里的鼓点起伏（低频 onset）。不稳定时可关闭该项。";
    } else {
      hint.textContent =
        "节拍闪光仅在试听播放中生效。关闭「实时音频」时用曲库 BPM 驱动闪光。";
    }
  }

  async function runSearch(q: string): Promise<void> {
    const query = q.trim();
    if (!query) return;

    listHost.innerHTML = "";
    const token = await ensureAccessToken();

    if (!token) {
      submitBtn.disabled = true;
      try {
        const items = await searchItunesPreviews(query);
        submitBtn.disabled = false;

        if (items.length === 0) {
          listHost.append(el("p", "hint", "没有找到匹配曲目，换个关键词试试。"));
          const { bpm, energy } = deriveDemoFeatures(query);
          pulseSync(bpm, energy, `演示 · ${query}`);
          return;
        }

        const ul = el("div", "track-list");
        for (const t of items) {
          const b = el("button", "track-item") as HTMLButtonElement;
          b.type = "button";
          const tag = t.previewUrl ? "可试听" : "无试听";
          b.innerHTML = `<strong>${escapeHtml(t.trackName)}</strong><span>${escapeHtml(t.artistName)} · ${tag}</span>`;
          b.addEventListener("click", () => {
            const { bpm, energy } = deriveDemoFeatures(`${t.trackName} ${t.artistName}`);
            pulseSync(bpm, energy, t.trackName);
            void tryPlayPreview(t.previewUrl, t.trackName);
            ul.querySelectorAll(".track-item").forEach((x) => {
              (x as HTMLElement).style.outline = "none";
            });
            b.style.outline = "2px solid hsla(var(--hue-base), var(--sat), 70%, 0.55)";
          });
          ul.append(b);
        }
        listHost.append(ul);

        const first = items[0];
        const { bpm, energy } = deriveDemoFeatures(`${first.trackName} ${first.artistName}`);
        pulseSync(bpm, energy, first.trackName);
        await tryPlayPreview(first.previewUrl, first.trackName);
      } catch {
        submitBtn.disabled = false;
        listHost.append(el("p", "hint", "无法连接 iTunes 搜索，请稍后重试。"));
        const { bpm, energy } = deriveDemoFeatures(query);
        pulseSync(bpm, energy, `演示 · ${query}`);
      }
      return;
    }

    submitBtn.disabled = true;
    try {
      const tracks = await searchTracks(token, query);
      submitBtn.disabled = false;

      if (tracks.length === 0) {
        listHost.append(el("p", "hint", "没有结果，换个关键词试试。"));
        return;
      }

      const ul = el("div", "track-list");
      for (const t of tracks) {
        const b = el("button", "track-item") as HTMLButtonElement;
        b.type = "button";
        const pv = t.previewUrl ? "可试听" : "无试听";
        b.innerHTML = `<strong>${escapeHtml(t.name)}</strong><span>${escapeHtml(t.artists)} · BPM ${t.bpm} · ${pv}</span>`;
        b.addEventListener("click", () => {
          pulseSync(t.bpm, t.energy, t.name);
          void tryPlayPreview(t.previewUrl, t.name);
          ul.querySelectorAll(".track-item").forEach((x) => {
            (x as HTMLElement).style.outline = "none";
          });
          b.style.outline = "2px solid hsla(var(--hue-base), var(--sat), 70%, 0.55)";
        });
        ul.append(b);
      }
      listHost.append(ul);

      const first = tracks[0];
      pulseSync(first.bpm, first.energy, first.name);
      await tryPlayPreview(first.previewUrl, first.name);
    } catch {
      submitBtn.disabled = false;
      clearSpotifyTokens();
      spotifyBtn.textContent = "连接 Spotify（真实 BPM）";
      logoutBtn.hidden = true;
      listHost.append(el("p", "hint", "Spotify 会话失效或请求被拒，已切换 iTunes 试听 + 演示 BPM。"));
      try {
        const items = await searchItunesPreviews(query);
        if (items.length === 0) {
          const { bpm, energy } = deriveDemoFeatures(query);
          pulseSync(bpm, energy, `演示 · ${query}`);
          return;
        }
        const ul = el("div", "track-list");
        for (const t of items) {
          const b = el("button", "track-item") as HTMLButtonElement;
          b.type = "button";
          const tag = t.previewUrl ? "可试听" : "无试听";
          b.innerHTML = `<strong>${escapeHtml(t.trackName)}</strong><span>${escapeHtml(t.artistName)} · ${tag}</span>`;
          b.addEventListener("click", () => {
            const { bpm, energy } = deriveDemoFeatures(`${t.trackName} ${t.artistName}`);
            pulseSync(bpm, energy, t.trackName);
            void tryPlayPreview(t.previewUrl, t.trackName);
            ul.querySelectorAll(".track-item").forEach((x) => {
              (x as HTMLElement).style.outline = "none";
            });
            b.style.outline = "2px solid hsla(var(--hue-base), var(--sat), 70%, 0.55)";
          });
          ul.append(b);
        }
        listHost.append(ul);
        const first = items[0];
        const { bpm, energy } = deriveDemoFeatures(`${first.trackName} ${first.artistName}`);
        pulseSync(bpm, energy, first.trackName);
        await tryPlayPreview(first.previewUrl, first.trackName);
      } catch {
        const { bpm, energy } = deriveDemoFeatures(query);
        pulseSync(bpm, energy, `演示 · ${query}`);
      }
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    void runSearch(input.value);
  });

  spotifyBtn.addEventListener("click", () => {
    void beginSpotifyLogin();
  });

  logoutBtn.addEventListener("click", () => {
    clearSpotifyTokens();
    spotifyBtn.textContent = "连接 Spotify（真实 BPM）";
    logoutBtn.hidden = true;
    listHost.innerHTML = "";
    pausePreview();
    previewTitle = "";
    killRealtimeLoop();
    syncPlayerUi();
    disableTorchDriver();
    torchBtn.textContent = "硬件闪光灯（实验）";
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

void (async () => {
  await handleSpotifyRedirect();
  render();
})();
