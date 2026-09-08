import { describe, expect, it } from "bun:test";

import { IMAGE_CONTENT_FORMATS, isVideoContentFormat } from "./ugc.schemas";

describe("isVideoContentFormat", () => {
  it("treats wall_of_text_slide and meme as image formats", () => {
    expect(IMAGE_CONTENT_FORMATS).toEqual(["wall_of_text_slide", "meme"]);
    for (const f of IMAGE_CONTENT_FORMATS) expect(isVideoContentFormat(f)).toBe(false);
  });

  it("treats every other canonical format as a video format", () => {
    for (const f of [
      "video_hook",
      "talking_head",
      "screen_recording",
      "product_demo",
      "spokesperson",
      "green_screen",
      "mobile_app",
      "clay_motion",
      "website_demo",
      "ugc_video",
    ]) {
      expect(isVideoContentFormat(f)).toBe(true);
    }
  });

  it("prefers video for unknown non-empty formats, stills when missing (status quo)", () => {
    expect(isVideoContentFormat("something_new")).toBe(true); // most formats are motion
    expect(isVideoContentFormat(null)).toBe(false);
    expect(isVideoContentFormat(undefined)).toBe(false);
    expect(isVideoContentFormat("")).toBe(false);
  });
});
