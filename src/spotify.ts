const SPOTIFY_AUTH = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN = "https://accounts.spotify.com/api/token";
const SPOTIFY_API = "https://api.spotify.com/v1";

const STORAGE_KEY = "rhythm_spotify_tokens_v1";

type StoredTokens = {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
};

function randomString(len: number): string {
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => ("0" + (b % 256).toString(16)).slice(-2)).join("");
}

async function sha256base64url(str: string): Promise<string> {
  const data = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  const b64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return b64;
}

function getRedirectUri(): string {
  return `${window.location.origin}${window.location.pathname.replace(/\/$/, "")}/`;
}

export function getStoredAccessToken(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as StoredTokens;
    if (Date.now() > t.expires_at - 60000) return null;
    return t.access_token;
  } catch {
    return null;
  }
}

export function clearSpotifyTokens(): void {
  localStorage.removeItem(STORAGE_KEY);
}

async function refreshAccessToken(refresh_token: string): Promise<StoredTokens | null> {
  const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined;
  if (!clientId) return null;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token,
    client_id: clientId
  });

  const res = await fetch(SPOTIFY_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };
  const expires_at = Date.now() + json.expires_in * 1000;
  const next: StoredTokens = {
    access_token: json.access_token,
    refresh_token: refresh_token,
    expires_at
  };
  if (json.refresh_token) next.refresh_token = json.refresh_token;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export async function ensureAccessToken(): Promise<string | null> {
  const existing = getStoredAccessToken();
  if (existing) return existing;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as StoredTokens;
    if (t.refresh_token) {
      const r = await refreshAccessToken(t.refresh_token);
      return r?.access_token ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

export async function beginSpotifyLogin(): Promise<void> {
  const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined;
  if (!clientId) {
    alert("请在 .env 中配置 VITE_SPOTIFY_CLIENT_ID，并在 Spotify Dashboard 添加回调地址。");
    return;
  }

  const codeVerifier = randomString(64);
  const codeChallenge = await sha256base64url(codeVerifier);
  sessionStorage.setItem("spotify_pkce_verifier", codeVerifier);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: getRedirectUri(),
    scope: "user-read-email",
    show_dialog: "false",
    code_challenge_method: "S256",
    code_challenge: codeChallenge
  });

  window.location.href = `${SPOTIFY_AUTH}?${params.toString()}`;
}

export async function handleSpotifyRedirect(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined;
  if (!code || !clientId) return false;

  const verifier = sessionStorage.getItem("spotify_pkce_verifier");
  if (!verifier) return false;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: getRedirectUri(),
    client_id: clientId,
    code_verifier: verifier
  });

  const res = await fetch(SPOTIFY_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  sessionStorage.removeItem("spotify_pkce_verifier");

  if (!res.ok) return false;

  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };

  const expires_at = Date.now() + json.expires_in * 1000;
  const stored: StoredTokens = {
    access_token: json.access_token,
    expires_at,
    refresh_token: json.refresh_token
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

  const url = new URL(window.location.href);
  url.search = "";
  window.history.replaceState({}, "", url.toString());
  return true;
}

export type TrackPick = {
  id: string;
  name: string;
  artists: string;
  bpm: number;
  energy: number;
  /** Spotify 30s 试听，部分曲目可能为空 */
  previewUrl: string | null;
};

export async function searchTracks(accessToken: string, q: string): Promise<TrackPick[]> {
  const url = new URL(`${SPOTIFY_API}/search`);
  url.searchParams.set("q", q);
  url.searchParams.set("type", "track");
  url.searchParams.set("limit", "8");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error("搜索失败");

  const data = (await res.json()) as {
    tracks: {
      items: {
        id: string;
        name: string;
        preview_url: string | null;
        artists: { name: string }[];
      }[];
    };
  };

  const ids = data.tracks.items.map((t) => t.id).filter(Boolean);
  if (ids.length === 0) return [];

  const afUrl = new URL(`${SPOTIFY_API}/audio-features`);
  afUrl.searchParams.set("ids", ids.join(","));
  const afRes = await fetch(afUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!afRes.ok) throw new Error("无法读取音频特征");

  const af = (await afRes.json()) as {
    audio_features: ({
      id: string;
      tempo: number | null;
      energy: number | null;
    } | null)[];
  };

  const afMap = new Map<string, { tempo: number; energy: number }>();
  for (const f of af.audio_features) {
    if (!f?.id) continue;
    const tempo = f.tempo ?? 120;
    const energy = f.energy ?? 0.5;
    afMap.set(f.id, { tempo, energy });
  }

  return data.tracks.items.map((t) => {
    const feat = afMap.get(t.id) ?? { tempo: 120, energy: 0.5 };
    return {
      id: t.id,
      name: t.name,
      artists: t.artists.map((a) => a.name).join(", "),
      bpm: Math.round(feat.tempo),
      energy: feat.energy,
      previewUrl: t.preview_url
    };
  });
}
