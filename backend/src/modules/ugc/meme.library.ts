// ponytail: predefined meme library — a constant, not a DB table / discovery system.
// The generation pipeline receives these memes and writes 5 overlay variations per
// meme. Replace the stub URLs/descriptions with the final set; shape stays the same.
//
// Video files live under R2_PUBLIC_URL (backend/.env, public base URL). Read
// lazily via process.env — like the Pexels key — so unit tests importing this
// module never need a validated env; only the file keys are hardcoded here.

export type MemeEntry = {
  id: string;
  meme: string;
  meme_url: string;
  meme_description: string;
  meme_metadata: string[];
};

export const MEME_VARIATIONS_PER_MEME = 5;

const R2_BASE = (process.env.R2_PUBLIC_URL ?? "https://pub-0a33eb19f0ef4401971cc16eecd2d8ec.r2.dev").replace(/\/+$/, "");
const memeFile = (file: string) => `${R2_BASE}/${file}`;

export const MEME_LIBRARY: MemeEntry[] = [
  {
    id: "dancing",
    meme: "Dancing",
    meme_url: memeFile("01a525faa9984251b9e088af94cfc890.mp4"),
    meme_description:
      "A person dancing energetically in a fun and expressive way. Fits celebration, excitement, winning, and humorous reactions.",
    meme_metadata: ["dancing", "celebration", "excited", "happy", "reaction", "funny"],
  },
  {
    id: "angry-annoyed-dog",
    meme: "Angry Annoyed Dog",
    meme_url: memeFile("063cb61798bb45759e7638595426f78e.mp4"),
    meme_description:
      "An angry and annoyed dog looking directly at the camera. Fits frustration, annoyance, disbelief, and funny reactions.",
    meme_metadata: ["angry", "annoyed", "dog", "frustration", "reaction", "funny"],
  },
  {
    id: "man-laughing-maniacally",
    meme: "Man Laughing Maniacally",
    meme_url: memeFile("1bb039d8c8ff4ef9a5d59280b5e53034.mp4"),
    meme_description:
      "A man laughing maniacally in an exaggerated way. Fits chaotic situations, unexpected wins, trolling, and exaggerated amusement.",
    meme_metadata: ["laughing", "maniacal", "chaos", "amusement", "reaction", "funny"],
  },
  {
    id: "i-dont-think-so",
    meme: "I Don't Think So",
    meme_url: memeFile("3c2473bd993943a2bbbae3043f614f13.mp4"),
    meme_description:
      "A reaction expressing strong doubt or disagreement. Fits rejection, disbelief, skepticism, disagreement, and calling out unrealistic ideas.",
    meme_metadata: ["disbelief", "rejection", "skepticism", "disagreement", "reaction", "funny"],
  },
];
