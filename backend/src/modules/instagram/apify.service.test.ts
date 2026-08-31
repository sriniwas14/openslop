import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import {
  normalizeCreatorToUrl,
  usernameFromUrl,
  normalizeInstagramRow,
  scrapeInstagram,
  ApifyError,
} from "./apify.service";

describe("normalizeCreatorToUrl", () => {
  it("handles @username", () => {
    expect(normalizeCreatorToUrl("@nike")).toBe("https://www.instagram.com/nike/");
  });

  it("handles bare username", () => {
    expect(normalizeCreatorToUrl("nike")).toBe("https://www.instagram.com/nike/");
  });

  it("keeps a valid full instagram URL unchanged", () => {
    expect(normalizeCreatorToUrl("https://www.instagram.com/nike/")).toBe("https://www.instagram.com/nike/");
  });

  it("strips trailing path and query from instagram URLs, keeping just the username", () => {
    expect(normalizeCreatorToUrl("https://www.instagram.com/nike/p/abc/reels/")).toBe("https://www.instagram.com/nike/");
    expect(normalizeCreatorToUrl("https://instagram.com/nike?hl=en")).toBe("https://www.instagram.com/nike/");
  });

  it("accepts instagram.com without www", () => {
    expect(normalizeCreatorToUrl("instagram.com/nike")).toBe("https://www.instagram.com/nike/");
  });

  it("rejects non-instagram external URLs", () => {
    expect(() => normalizeCreatorToUrl("https://facebook.com/nike")).toThrow();
    expect(() => normalizeCreatorToUrl("https://example.com")).toThrow();
  });

  it("rejects invalid / empty input", () => {
    expect(() => normalizeCreatorToUrl("")).toThrow();
    expect(() => normalizeCreatorToUrl("   ")).toThrow();
    expect(() => normalizeCreatorToUrl("not a user name with spaces")).toThrow();
    expect(() => normalizeCreatorToUrl("https://www.instagram.com/!/posts")).toThrow();
    expect(() => normalizeCreatorToUrl("https://www.instagram.com/")).toThrow();
  });
});

describe("usernameFromUrl", () => {
  it("extracts the username", () => {
    expect(usernameFromUrl("https://www.instagram.com/nike/")).toBe("nike");
  });
});

describe("normalizeInstagramRow", () => {
  it("maps the main Apify fields, preserving optional ones as null", () => {
    const p = normalizeInstagramRow({
      id: "123",
      shortcode: "abc123",
      username: "nike",
      ownerFullName: "Nike",
      caption: "Great run #fitness",
      type: "Image",
      displayUrl: "https://cdn.example.com/a.jpg",
      timestamp: "2026-08-28T12:00:00.000Z",
      likesCount: 12450,
      commentsCount: 184,
      hashtags: ["fitness"],
    });
    expect(p.externalPostId).toBe("abc123");
    expect(p.shortcode).toBe("abc123");
    expect(p.username).toBe("nike");
    expect(p.ownerFullName).toBe("Nike");
    expect(p.caption).toBe("Great run #fitness");
    expect(p.mediaType).toBe("image");
    expect(p.mediaUrl).toBe("https://cdn.example.com/a.jpg");
    expect(p.likes).toBe(12450);
    expect(p.comments).toBe(184);
    expect(p.hashtags).toEqual(["fitness"]);
    expect(p.postUrl).toBe("https://www.instagram.com/p/abc123/");
  });

  it("extracts hashtags from the caption when the hashtags field is missing", () => {
    const p = normalizeInstagramRow({ shortcode: "x", caption: "hello #world #OpenAI" });
    expect(p.hashtags).toEqual(["world", "OpenAI"]);
  });

  it("treats missing numeric fields as null, not 0", () => {
    const p = normalizeInstagramRow({ shortcode: "x" });
    expect(p.likes).toBeNull();
    expect(p.comments).toBeNull();
    expect(p.shares).toBeNull();
    expect(p.mediaType).toBeNull();
    expect(p.caption).toBeNull();
  });
});

describe("scrapeInstagram", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetch(status: number, body: unknown) {
    globalThis.fetch = (async (url: any, init?: any) => {
      return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }) as any;
    }) as any;
  }

  it("calls the correct endpoint with token and body, and returns normalized posts", async () => {
    let seenUrl: string | undefined;
    let seenBody: any;
    globalThis.fetch = (async (url: any, init?: any) => {
      seenUrl = url;
      seenBody = JSON.parse(init?.body ?? "{}");
      return new Response(JSON.stringify([
        { shortcode: "p1", username: "nike", type: "Image", caption: "a", likesCount: 10 },
      ]), { status: 200 }) as any;
    }) as any;

    const posts = await scrapeInstagram({ token: "SECRET_TOKEN", profileUrl: "https://www.instagram.com/nike/", username: "nike", resultsLimit: 20 });

    expect(seenUrl).toContain("apify~instagram-scraper/run-sync-get-dataset-items?token=SECRET_TOKEN");
    expect(seenBody).toEqual({
      resultsType: "posts",
      directUrls: ["https://www.instagram.com/nike/"],
      resultsLimit: 20,
    });
    expect(posts).toHaveLength(1);
    expect(posts[0].externalPostId).toBe("p1");
  });

  it("returns empty array on an empty response array", async () => {
    mockFetch(200, []);
    const posts = await scrapeInstagram({ token: "t", profileUrl: "u", username: "nike", resultsLimit: 20 });
    expect(posts).toEqual([]);
  });

  it("accepts {items: [...]} wrapped response", async () => {
    mockFetch(200, { items: [{ shortcode: "w", username: "nike", type: "Video", likesCount: 5 }] });
    const posts = await scrapeInstagram({ token: "t", profileUrl: "u", username: "nike", resultsLimit: 10 });
    expect(posts).toHaveLength(1);
    expect(posts[0].mediaType).toBe("video");
  });

  it("filters out posts from other creators on a profile scrape", async () => {
    mockFetch(200, [
      { shortcode: "a", username: "nike", likesCount: 1 },
      { shortcode: "b", username: "someoneelse", likesCount: 1 },
    ]);
    const posts = await scrapeInstagram({ token: "t", profileUrl: "https://www.instagram.com/nike/", username: "nike", resultsLimit: 20 });
    expect(posts.map((p) => p.externalPostId)).toEqual(["a"]);
  });

  it("throws ApifyError(invalid_key) on 401", async () => {
    mockFetch(401, {});
    await expect(
      scrapeInstagram({ token: "t", profileUrl: "u", username: "nike", resultsLimit: 20 }),
    ).rejects.toBeInstanceOf(ApifyError);
    try {
      await scrapeInstagram({ token: "t", profileUrl: "u", username: "nike", resultsLimit: 20 });
    } catch (e: any) {
      expect(e.kind).toBe("invalid_key");
    }
  });

  it("throws ApifyError(upstream) on other non-ok status", async () => {
    mockFetch(500, { message: "internal error" });
    await expect(
      scrapeInstagram({ token: "t", profileUrl: "u", username: "nike", resultsLimit: 20 }),
    ).rejects.toThrow();
  });

  it("throws ApifyError(invalid_response) on non-JSON body", async () => {
    globalThis.fetch = (async () => new Response("<html>") as any) as any;
    try {
      await scrapeInstagram({ token: "t", profileUrl: "u", username: "nike", resultsLimit: 20 });
      expect.unreachable();
    } catch (e: any) {
      expect(e.kind).toBe("invalid_response");
    }
  });

  it("throws on network error (timeout) without leaking token", async () => {
    globalThis.fetch = (async () => {
      throw new Error("AbortError: network");
    }) as any;
    try {
      await scrapeInstagram({ token: "TOPSECRETKEY123", profileUrl: "u", username: "nike", resultsLimit: 20 });
      expect.unreachable();
    } catch (e: any) {
      expect(e).toBeInstanceOf(ApifyError);
      expect(String(e.message)).not.toContain("TOPSECRETKEY123");
    }
  });
});
