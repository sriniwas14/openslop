import { beforeEach, describe, expect, it } from "bun:test";

// Pure client tests — an injected fetchFn/sleep means these never touch the network and
// never actually wait, so retry/backoff behaviour is asserted on the recorded calls.
const { PexelsError, searchPexelsPhotos, searchPexelsVideos, getPexelsApiKey, hasPexelsKey, __resetPexelsThrottle } = await import("./pexels.service");

const KEY = "test-pexels-key";

function photo(over: Record<string, any> = {}) {
  return {
    id: 1001,
    width: 800,
    height: 1200,
    url: "https://www.pexels.com/photo/1001/",
    photographer: "A. Person",
    avg_color: "#2B2B2B",
    alt: "person holding a smartphone at home",
    src: {
      original: "https://images.pexels.com/photos/1001/original.jpeg",
      large2x: "https://images.pexels.com/photos/1001/large2x.jpeg",
      large: "https://images.pexels.com/photos/1001/large.jpeg",
      medium: "https://images.pexels.com/photos/1001/medium.jpeg",
    },
    ...over,
  };
}

type Call = { url: string; init: any };

/** Fake fetch that records every call and answers from a queue (or a single handler). */
function fakeFetch(handler: (call: Call, n: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = (async (url: any, init: any) => {
    const call = { url: String(url), init };
    calls.push(call);
    return handler(call, calls.length - 1);
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

/** Records backoff waits instead of sleeping — keeps retry tests instant. */
function recordingSleep() {
  const waits: number[] = [];
  return { sleep: async (ms: number) => void waits.push(ms), waits };
}

beforeEach(() => {
  __resetPexelsThrottle();
  delete process.env.PEXELS_API_KEY;
});

// ---------------------------------------------------------------------------
// Request shape + key handling
// ---------------------------------------------------------------------------

describe("searchPexelsPhotos request shape", () => {
  it("sends the query, per_page, orientation and the key in the Authorization header", async () => {
    const { fn, calls } = fakeFetch(() => jsonResponse({ photos: [photo()] }));
    const found = await searchPexelsPhotos(
      { query: "founder working laptop", orientation: "portrait", perPage: 24, queryIndex: 2 },
      { apiKey: KEY, fetchFn: fn, minIntervalMs: 0 },
    );

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe("https://api.pexels.com/v1/search");
    expect(url.searchParams.get("query")).toBe("founder working laptop");
    expect(url.searchParams.get("per_page")).toBe("24");
    expect(url.searchParams.get("orientation")).toBe("portrait");
    expect(url.searchParams.get("page")).toBeNull(); // page 1 is omitted
    // the key travels as a bare Authorization header (Pexels has no "Bearer" prefix)
    expect(calls[0].init.headers.Authorization).toBe(KEY);
    expect(calls[0].init.headers.Accept).toBe("application/json");
    // and never appears in the URL or the normalized result
    expect(calls[0].url).not.toContain(KEY);
    expect(JSON.stringify(found)).not.toContain(KEY);
    expect(found).toHaveLength(1);
  });

  it("omits orientation when it is not a Pexels-supported value and sends page > 1", async () => {
    const { fn, calls } = fakeFetch(() => jsonResponse({ photos: [] }));
    await searchPexelsPhotos({ query: "desk", orientation: null, perPage: 10, page: 3 }, { apiKey: KEY, fetchFn: fn, minIntervalMs: 0 });
    const url = new URL(calls[0].url);
    expect(url.searchParams.has("orientation")).toBe(false);
    expect(url.searchParams.get("page")).toBe("3");
  });

  it("honours a custom baseUrl", async () => {
    const { fn, calls } = fakeFetch(() => jsonResponse({ photos: [] }));
    await searchPexelsPhotos({ query: "desk" }, { apiKey: KEY, fetchFn: fn, minIntervalMs: 0, baseUrl: "https://example.test/v1/" });
    expect(calls[0].url.startsWith("https://example.test/v1/search?")).toBe(true); // trailing slash collapsed
  });

  it("reads the key from process.env when none is injected, and reports whether one exists", async () => {
    expect(hasPexelsKey()).toBe(false);
    expect(getPexelsApiKey()).toBeNull();

    process.env.PEXELS_API_KEY = `  ${KEY}  `;
    expect(hasPexelsKey()).toBe(true);
    expect(getPexelsApiKey()).toBe(KEY); // trimmed

    const { fn } = fakeFetch(() => jsonResponse({ photos: [photo()] }));
    const found = await searchPexelsPhotos({ query: "desk" }, { fetchFn: fn, minIntervalMs: 0 });
    expect(found).toHaveLength(1);
  });

  it("throws a non-retryable 500 when no key is configured, without calling fetch", async () => {
    const { fn, calls } = fakeFetch(() => jsonResponse({ photos: [] }));
    const err: any = await searchPexelsPhotos({ query: "desk" }, { fetchFn: fn, minIntervalMs: 0 }).catch((e) => e);
    expect(err).toBeInstanceOf(PexelsError);
    expect(err.status).toBe(500);
    expect(err.retryable).toBe(false);
    expect(err.message).toMatch(/PEXELS_API_KEY/);
    expect(calls).toHaveLength(0); // never reaches the network
  });

  it("an explicitly injected null key is treated as missing (not as env fallback)", async () => {
    process.env.PEXELS_API_KEY = KEY;
    const { fn, calls } = fakeFetch(() => jsonResponse({ photos: [] }));
    await expect(searchPexelsPhotos({ query: "desk" }, { apiKey: null, fetchFn: fn, minIntervalMs: 0 })).rejects.toBeInstanceOf(PexelsError);
    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

describe("photo normalization", () => {
  it("maps a Pexels photo onto the provider-agnostic candidate shape", async () => {
    const { fn } = fakeFetch(() => jsonResponse({ photos: [photo()] }));
    const [c] = await searchPexelsPhotos({ query: "phone at home", queryIndex: 1 }, { apiKey: KEY, fetchFn: fn, minIntervalMs: 0 });

    expect(c.source).toBe("pexels");
    expect(c.sourceAssetId).toBe("1001");
    expect(c.sourceUrl).toBe("https://www.pexels.com/photo/1001/");
    expect(c.previewUrl).toBe("https://images.pexels.com/photos/1001/large2x.jpeg"); // large2x preferred
    expect(c.downloadUrl).toBe("https://images.pexels.com/photos/1001/original.jpeg"); // original for the future composition stage
    expect(c.width).toBe(800);
    expect(c.height).toBe(1200);
    expect(c.orientation).toBe("portrait");
    expect(c.altText).toBe("person holding a smartphone at home");
    expect(c.photographer).toBe("A. Person");
    expect(c.avgColor).toBe("#2B2B2B");
    // provenance for the semantic scorer
    expect(c.query).toBe("phone at home");
    expect(c.queryIndex).toBe(1);
  });

  it("derives orientation from the width/height ratio", async () => {
    const cases: [number, number, "portrait" | "landscape" | "square"][] = [
      [800, 1200, "portrait"],
      [1200, 800, "landscape"],
      [1000, 1000, "square"],
      [1000, 950, "square"], // within the 0.92..1.08 tolerance
      [0, 0, "square"], // unusable dimensions fall back rather than crash
    ];
    for (const [width, height, expected] of cases) {
      const { fn } = fakeFetch(() => jsonResponse({ photos: [photo({ id: 7, width, height })] }));
      const [c] = await searchPexelsPhotos({ query: "q" }, { apiKey: KEY, fetchFn: fn, minIntervalMs: 0 });
      expect(c.orientation).toBe(expected);
    }
  });

  it("falls back through src sizes and a synthesized sourceUrl", async () => {
    const { fn } = fakeFetch(() =>
      jsonResponse({
        photos: [photo({ id: 55, url: undefined, src: { medium: "https://images.pexels.com/m.jpeg" } })],
      }),
    );
    const [c] = await searchPexelsPhotos({ query: "q" }, { apiKey: KEY, fetchFn: fn, minIntervalMs: 0 });
    expect(c.previewUrl).toBe("https://images.pexels.com/m.jpeg");
    expect(c.downloadUrl).toBe("https://images.pexels.com/m.jpeg"); // no original → reuse the preview
    expect(c.sourceUrl).toBe("https://www.pexels.com/photo/55");
  });

  it("drops photos that have no id or no usable image URL", async () => {
    const { fn } = fakeFetch(() =>
      jsonResponse({
        photos: [photo({ id: 1 }), photo({ id: null }), photo({ id: 2, src: {} }), photo({ id: 3, src: { small: "https://x/s.jpeg" } })],
      }),
    );
    const found = await searchPexelsPhotos({ query: "q" }, { apiKey: KEY, fetchFn: fn, minIntervalMs: 0 });
    // id 1 kept; null id dropped; empty src dropped; `small` is not a preview tier → dropped
    expect(found.map((c) => c.sourceAssetId)).toEqual(["1"]);
  });

  it("coerces tags to strings, caps their length, and tolerates a missing array", async () => {
    const { fn } = fakeFetch(() =>
      jsonResponse({ photos: [photo({ id: 9, tags: Array.from({ length: 40 }, (_, i) => `tag${i}`) }), photo({ id: 10 })] }),
    );
    const found = await searchPexelsPhotos({ query: "q" }, { apiKey: KEY, fetchFn: fn, minIntervalMs: 0 });
    expect(found[0].tags).toHaveLength(20);
    expect(found[0].tags.every((t) => typeof t === "string")).toBe(true);
    expect(found[1].tags).toEqual([]);
  });

  it("returns an empty list for a malformed or empty body instead of throwing", async () => {
    const { fn: noPhotos } = fakeFetch(() => jsonResponse({ total_results: 0 }));
    expect(await searchPexelsPhotos({ query: "q" }, { apiKey: KEY, fetchFn: noPhotos, minIntervalMs: 0 })).toEqual([]);

    const { fn: badJson } = fakeFetch(() => new Response("not json", { status: 200 }));
    expect(await searchPexelsPhotos({ query: "q" }, { apiKey: KEY, fetchFn: badJson, minIntervalMs: 0 })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Retry / backoff / rate limits
// ---------------------------------------------------------------------------

describe("retry and rate limiting", () => {
  it("retries a 429 and succeeds, backing off exponentially", async () => {
    const { sleep, waits } = recordingSleep();
    const { fn, calls } = fakeFetch((_c, n) => (n === 0 ? jsonResponse({ error: "rate limited" }, 429) : jsonResponse({ photos: [photo()] })));

    const found = await searchPexelsPhotos({ query: "q" }, { apiKey: KEY, fetchFn: fn, sleep, minIntervalMs: 0, maxRetries: 3 });
    expect(found).toHaveLength(1);
    expect(calls).toHaveLength(2);
    expect(waits.filter((w) => w > 0)).toEqual([1000]); // 500 * 2^1
  });

  it("honours Retry-After when the server provides one", async () => {
    const { sleep, waits } = recordingSleep();
    const { fn } = fakeFetch((_c, n) => (n === 0 ? jsonResponse({}, 429, { "retry-after": "3" }) : jsonResponse({ photos: [] })));
    await searchPexelsPhotos({ query: "q" }, { apiKey: KEY, fetchFn: fn, sleep, minIntervalMs: 0 });
    expect(waits).toContain(3000); // 3s → ms, not the default backoff
  });

  it("retries 5xx responses", async () => {
    const { sleep } = recordingSleep();
    const { fn, calls } = fakeFetch((_c, n) => (n < 2 ? jsonResponse({}, 503) : jsonResponse({ photos: [photo()] })));
    const found = await searchPexelsPhotos({ query: "q" }, { apiKey: KEY, fetchFn: fn, sleep, minIntervalMs: 0 });
    expect(found).toHaveLength(1);
    expect(calls).toHaveLength(3);
  });

  it("retries network errors and gives up with a retryable 502", async () => {
    const { sleep, waits } = recordingSleep();
    const { fn, calls } = fakeFetch(() => {
      throw new Error("socket hang up");
    });
    const err: any = await searchPexelsPhotos({ query: "q" }, { apiKey: KEY, fetchFn: fn, sleep, minIntervalMs: 0, maxRetries: 2 }).catch((e) => e);
    expect(err).toBeInstanceOf(PexelsError);
    expect(err.status).toBe(502);
    expect(err.retryable).toBe(true);
    expect(err.message).toMatch(/socket hang up/);
    expect(calls).toHaveLength(3); // initial + 2 retries
    expect(waits.length).toBeGreaterThan(0);
  });

  it("throws a retryable error once 429 retries are exhausted", async () => {
    const { sleep } = recordingSleep();
    const { fn, calls } = fakeFetch(() => jsonResponse({}, 429));
    const err: any = await searchPexelsPhotos({ query: "q" }, { apiKey: KEY, fetchFn: fn, sleep, minIntervalMs: 0, maxRetries: 2 }).catch((e) => e);
    expect(err).toBeInstanceOf(PexelsError);
    expect(err.status).toBe(429);
    expect(err.retryable).toBe(true);
    expect(calls).toHaveLength(3);
  });

  it("does not retry a rejected key (401/403) or a 400", async () => {
    const { sleep } = recordingSleep();
    for (const status of [401, 403, 400]) {
      __resetPexelsThrottle();
      const { fn, calls } = fakeFetch(() => jsonResponse({}, status));
      const err: any = await searchPexelsPhotos({ query: "q" }, { apiKey: KEY, fetchFn: fn, sleep, minIntervalMs: 0, maxRetries: 3 }).catch((e) => e);
      expect(err).toBeInstanceOf(PexelsError);
      expect(err.status).toBe(status);
      expect(err.retryable).toBe(false);
      expect(calls).toHaveLength(1); // one shot, no wasted quota
    }
  });

  it("throttles concurrent requests to the minimum interval", async () => {
    const { sleep, waits } = recordingSleep();
    const { fn } = fakeFetch(() => jsonResponse({ photos: [] }));
    const deps = { apiKey: KEY, fetchFn: fn, sleep, minIntervalMs: 400 };

    // three queries fired at once must serialize through one shared gate
    await Promise.all([
      searchPexelsPhotos({ query: "a" }, deps),
      searchPexelsPhotos({ query: "b" }, deps),
      searchPexelsPhotos({ query: "c" }, deps),
    ]);
    const throttleWaits = waits.filter((w) => w > 0 && w <= 400);
    expect(throttleWaits.length).toBeGreaterThanOrEqual(2); // at least the 2nd and 3rd waited
    for (const w of throttleWaits) expect(w).toBeLessThanOrEqual(400);
  });

  it("keeps the throttle chain alive after a failure (a rejected call cannot wedge later ones)", async () => {
    const { sleep } = recordingSleep();
    const { fn } = fakeFetch((_c, n) => (n === 0 ? jsonResponse({}, 400) : jsonResponse({ photos: [photo()] })));
    await searchPexelsPhotos({ query: "a" }, { apiKey: KEY, fetchFn: fn, sleep, minIntervalMs: 0 }).catch(() => {});
    const found = await searchPexelsPhotos({ query: "b" }, { apiKey: KEY, fetchFn: fn, sleep, minIntervalMs: 0 });
    expect(found).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Video search — separate Pexels endpoint, normalized into the same shape
// ---------------------------------------------------------------------------

function videoFile(over: Record<string, any> = {}) {
  return {
    id: 11,
    quality: "hd",
    file_type: "video/mp4",
    width: 1080,
    height: 1920,
    link: "https://videos.pexels.com/video-files/2001/2001-hd_1080_1920_25fps.mp4",
    ...over,
  };
}

function video(over: Record<string, any> = {}) {
  return {
    id: 2001,
    width: 1080,
    height: 1920,
    duration: 30,
    url: "https://www.pexels.com/video/2001/",
    image: "https://images.pexels.com/videos/2001/pictures/preview-0.jpg",
    user: { name: "V.ideographer" },
    video_files: [videoFile()],
    ...over,
  };
}

describe("searchPexelsVideos", () => {
  it("hits the videos endpoint with size=medium and normalizes to the shared candidate shape", async () => {
    const { fn, calls } = fakeFetch(() => jsonResponse({ videos: [video()] }));
    const found = await searchPexelsVideos(
      { query: "founder talking camera", orientation: "portrait", perPage: 24, queryIndex: 1 },
      { apiKey: KEY, fetchFn: fn, minIntervalMs: 0 },
    );

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe("https://api.pexels.com/videos/search");
    expect(url.searchParams.get("query")).toBe("founder talking camera");
    expect(url.searchParams.get("orientation")).toBe("portrait");
    expect(url.searchParams.get("size")).toBe("medium");
    expect(calls[0].init.headers.Authorization).toBe(KEY);

    expect(found).toHaveLength(1);
    const [c] = found;
    expect(c.mediaType).toBe("video");
    expect(c.sourceAssetId).toBe("video_2001"); // prefixed — photo/video IDs share a namespace
    expect(c.previewUrl).toContain(".mp4");
    expect(c.downloadUrl).toContain(".mp4");
    expect(c.posterUrl).toContain("preview-0.jpg");
    expect(c.duration).toBe(30);
    expect(c.orientation).toBe("portrait");
    expect(c.queryIndex).toBe(1);
  });

  it("prefers an HD mp4 near 1080p and skips videos with no playable file", async () => {
    const { fn } = fakeFetch(() =>
      jsonResponse({
        videos: [
          video({
            id: 1,
            video_files: [
              videoFile({ quality: "uhd", width: 3840, link: "https://videos.pexels.com/video-files/1/uhd.mp4" }),
              videoFile({ quality: "hd", width: 720, link: "https://videos.pexels.com/video-files/1/hd720.mp4" }),
              videoFile({ quality: "sd", width: 640, link: "https://videos.pexels.com/video-files/1/sd.mp4" }),
            ],
          }),
          video({ id: 2, video_files: [{ quality: "hd", file_type: "video/mov", width: 1080, link: "https://x/y.mov" }] }),
          video({ id: 3, video_files: [] }),
        ],
      }),
    );
    const found = await searchPexelsVideos({ query: "q" }, { apiKey: KEY, fetchFn: fn, minIntervalMs: 0 });
    expect(found).toHaveLength(1);
    expect(found[0].sourceAssetId).toBe("video_1");
    expect(found[0].previewUrl).toBe("https://videos.pexels.com/video-files/1/hd720.mp4");
  });

  it("returns [] for missing videos payload and rejects without a key", async () => {
    const { fn } = fakeFetch(() => jsonResponse({}));
    expect(await searchPexelsVideos({ query: "q" }, { apiKey: KEY, fetchFn: fn, minIntervalMs: 0 })).toEqual([]);
    await expect(searchPexelsVideos({ query: "q" }, { apiKey: null, fetchFn: fn, minIntervalMs: 0 })).rejects.toBeInstanceOf(PexelsError);
  });

  it("derives the videos base from a custom baseUrl", async () => {
    const { fn, calls } = fakeFetch(() => jsonResponse({ videos: [] }));
    await searchPexelsVideos({ query: "desk" }, { apiKey: KEY, fetchFn: fn, minIntervalMs: 0, baseUrl: "https://example.test/v1/" });
    expect(calls[0].url.startsWith("https://example.test/videos/search?")).toBe(true);
  });
});
