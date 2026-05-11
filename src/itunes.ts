export type ItunesPick = {
  trackName: string;
  artistName: string;
  previewUrl: string | null;
};

export async function searchItunesPreviews(q: string): Promise<ItunesPick[]> {
  const trimmed = q.trim();
  if (!trimmed) return [];

  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", trimmed);
  url.searchParams.set("media", "music");
  url.searchParams.set("entity", "song");
  url.searchParams.set("limit", "10");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("iTunes 搜索失败");

  const data = (await res.json()) as {
    results: Array<{
      trackName?: string;
      artistName?: string;
      previewUrl?: string;
    }>;
  };

  return data.results
    .filter((r) => r.trackName && r.artistName)
    .map((r) => ({
      trackName: r.trackName as string,
      artistName: r.artistName as string,
      previewUrl: r.previewUrl ?? null
    }));
}
