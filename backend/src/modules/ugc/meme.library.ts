// ponytail: predefined meme library — a constant, not a DB table / discovery system.
// The generation pipeline receives these memes and writes 5 overlay variations per
// meme. Replace the stub URLs/descriptions with the final set; shape stays the same.

export type MemeEntry = {
  id: string;
  meme: string;
  meme_url: string;
  meme_description: string;
  meme_metadata: string[];
};

export const MEME_VARIATIONS_PER_MEME = 5;

export const MEME_LIBRARY: MemeEntry[] = [
  {
    id: "distracted-boyfriend",
    meme: "Distracted Boyfriend",
    meme_url: "https://i.imgflip.com/1ur9b0.jpg",
    meme_description:
      "A man walking with his girlfriend turns around to stare at another woman while his girlfriend looks on in outrage. The joke is divided loyalty: ignoring what you have for something shiny and new. Reaction of temptation vs. commitment; emotion is cheeky betrayal. Fits situations about switching tools, chasing trends, or abandoning a working solution.",
    meme_metadata: ["temptation", "choice", "comparison", "switching", "relatable", "funny"],
  },
  {
    id: "drake-hotline-bling",
    meme: "Drake Hotline Bling",
    meme_url: "https://i.imgflip.com/30b1gx.jpg",
    meme_description:
      "Drake rejects something in the top panel and approves something in the bottom panel. The joke is a blunt before/after preference: old way bad, new way good. Reaction of confident dismissal then endorsement; emotion is smug certainty. Fits expectation-vs-reality, old workflow vs. new workflow, manual vs. automated.",
    meme_metadata: ["preference", "before-after", "comparison", "rejection", "endorsement", "funny"],
  },
  {
    id: "two-buttons",
    meme: "Two Buttons",
    meme_url: "https://i.imgflip.com/1g8my4.jpg",
    meme_description:
      "A sweating person hesitates between two red buttons, forced to pick one. The joke is an impossible dilemma where both options hurt. Reaction of anxious indecision; emotion is stress and panic. Fits founder/customer dilemmas, trade-offs, and lose-lose daily choices.",
    meme_metadata: ["dilemma", "choice", "stress", "decision", "founder", "relatable"],
  },
  {
    id: "change-my-mind",
    meme: "Change My Mind",
    meme_url: "https://i.imgflip.com/24y43o.jpg",
    meme_description:
      "A man sits at a table with a sign stating a hot take and 'change my mind'. The joke is a deliberately provocative opinion inviting debate. Reaction of defiant confidence; emotion is playful stubbornness. Fits contrarian industry takes, unpopular opinions, and myth-busting.",
    meme_metadata: ["opinion", "hot-take", "debate", "contrarian", "confident", "funny"],
  },
  {
    id: "left-exit-12",
    meme: "Left Exit 12 Off Ramp",
    meme_url: "https://i.imgflip.com/3nw6x.jpg",
    meme_description:
      "A car swerves off the highway to take an unexpected exit. The joke is abandoning the sensible path for a tempting shortcut or distraction. Reaction of impulsive swerving; emotion is mischievous temptation. Fits procrastination, shiny-object syndrome, and process-skipping.",
    meme_metadata: ["shortcut", "distraction", "choice", "impulsive", "relatable", "funny"],
  },
  {
    id: "mocking-spongebob",
    meme: "Mocking SpongeBob",
    meme_url: "https://i.imgflip.com/1otk96.jpg",
    meme_description:
      "SpongeBob in a mocking pose with alternating-case text imitating someone sarcastically. The joke is repeating bad advice or excuses in a sarcastic voice. Reaction of eye-rolling mockery; emotion is sarcastic amusement. Fits calling out bad habits, excuses, and outdated advice.",
    meme_metadata: ["sarcasm", "mockery", "excuses", "bad-advice", "reaction", "funny"],
  },
  {
    id: "surprised-pikachu",
    meme: "Surprised Pikachu",
    meme_url: "https://i.imgflip.com/2kbn1e.jpg",
    meme_description:
      "Pikachu with a shocked open-mouth face after the obvious consequence of an action. The joke is being surprised by the entirely predictable outcome of your own choices. Reaction of feigned shock; emotion is ironic disbelief. Fits self-inflicted problems, ignored warnings, and predictable failures.",
    meme_metadata: ["consequences", "irony", "shock", "mistake", "self-inflicted", "funny"],
  },
  {
    id: "this-is-fine",
    meme: "This Is Fine",
    meme_url: "https://i.imgflip.com/55307j.jpg",
    meme_description:
      "A dog sits calmly in a burning room saying 'this is fine'. The joke is calm denial while everything falls apart. Reaction of forced composure; emotion is anxious denial masking panic. Fits outages, overwhelm, inbox chaos, and pretending broken processes are okay.",
    meme_metadata: ["denial", "chaos", "overwhelm", "coping", "relatable", "funny"],
  },
  {
    id: "woman-yelling-cat",
    meme: "Woman Yelling at a Cat",
    meme_url: "https://i.imgflip.com/43a45p.jpg",
    meme_description:
      "An angry woman yells while a smug cat sits at a dinner table unfazed. The joke is an overreaction meeting total indifference — yelling into the void. Reaction of frustration vs. calm dismissal; emotion is exasperated comedy. Fits customer complaints, feedback ignored, and arguing with reality.",
    meme_metadata: ["argument", "frustration", "reaction", "indifference", "relatable", "funny"],
  },
  {
    id: "bernie-mittens",
    meme: "Bernie Sanders Mittens",
    meme_url: "https://i.imgflip.com/1c1uej.jpg",
    meme_description:
      "Bernie Sanders sits bundled up, arms crossed, looking grumpy and unimpressed. The joke is the unimpressed observer watching nonsense unfold. Reaction of deadpan judgment; emotion is grumpy disapproval. Fits skepticism toward hype, trends, and overcomplicated solutions.",
    meme_metadata: ["skepticism", "judgment", "reaction", "grumpy", "hype", "funny"],
  },
  {
    id: "success-kid",
    meme: "Success Kid",
    meme_url: "https://i.imgflip.com/1bhm.jpg",
    meme_description:
      "A toddler clenches his fist in triumph on the beach. The joke is a tiny win celebrated like a championship. Reaction of pure victorious joy; emotion is excitement and relief. Fits small product wins, saved time, problems solved, and before/after relief.",
    meme_metadata: ["win", "success", "celebration", "relief", "before-after", "happy"],
  },
  {
    id: "one-does-not-simply",
    meme: "One Does Not Simply",
    meme_url: "https://i.imgflip.com/1bij.jpg",
    meme_description:
      "Boromir from Lord of the Rings warns gravely that something is not simple. The joke is that a seemingly easy task is actually hard. Reaction of grave warning; emotion is weary knowingness. Fits underestimated tasks, hidden complexity, and 'just do X' advice.",
    meme_metadata: ["difficulty", "warning", "complexity", "advice", "relatable", "funny"],
  },
  {
    id: "grumpy-cat",
    meme: "Grumpy Cat",
    meme_url: "https://i.imgflip.com/8p0a.jpg",
    meme_description:
      "A cat with a permanently displeased frown paired with a negative statement. The joke is blunt pessimistic refusal — hating everything. Reaction of deadpan negativity; emotion is grumpy disdain. Fits pet peeves, hated chores, and things nobody enjoys doing.",
    meme_metadata: ["negativity", "refusal", "pet-peeve", "grumpy", "reaction", "funny"],
  },
  {
    id: "philosoraptor",
    meme: "Philosoraptor",
    meme_url: "https://i.imgflip.com/1bgs.jpg",
    meme_description:
      "A velociraptor ponders a deep paradoxical question. The joke is overthinking a silly everyday contradiction. Reaction of thoughtful confusion; emotion is curious bewilderment. Fits shower thoughts, industry paradoxes, and funny contradictions in daily work.",
    meme_metadata: ["question", "paradox", "thinking", "confusion", "insight", "funny"],
  },
  {
    id: "bad-luck-brian",
    meme: "Bad Luck Brian",
    meme_url: "https://i.imgflip.com/1bip.jpg",
    meme_description:
      "An awkward school photo paired with a story where everything goes wrong. The joke is catastrophic misfortune striking an ordinary situation. Reaction of resigned embarrassment; emotion is comic despair. Fits fail stories, worst-case scenarios, and relatable mishaps.",
    meme_metadata: ["fail", "bad-luck", "mistake", "story", "embarrassment", "funny"],
  },
  {
    id: "ancient-aliens",
    meme: "Ancient Aliens",
    meme_url: "https://i.imgflip.com/1e39.jpg",
    meme_description:
      "A wild-haired man declares an absurd over-the-top explanation for everything. The joke is blaming a grand conspiracy for mundane problems. Reaction of unhinged certainty; emotion is manic conviction. Fits blame games, absurd excuses, and overcomplicated explanations for simple failures.",
    meme_metadata: ["blame", "excuse", "conspiracy", "exaggeration", "reaction", "funny"],
  },
  {
    id: "roll-safe",
    meme: "Roll Safe",
    meme_url: "https://i.imgflip.com/1h7in3.jpg",
    meme_description:
      "A man taps his temple smugly to signal a clever-but-dubious life hack. The joke is technically-correct logic that is actually terrible advice. Reaction of smug cleverness; emotion is mischievous pride. Fits questionable shortcuts, lazy hacks, and 'technically not wrong' workarounds.",
    meme_metadata: ["life-hack", "shortcut", "clever", "smug", "workaround", "funny"],
  },
  {
    id: "expanding-brain",
    meme: "Expanding Brain",
    meme_url: "https://i.imgflip.com/1jwhww.jpg",
    meme_description:
      "Four panels show a brain glowing brighter with each increasingly absurd level of enlightenment. The joke is escalating takes from obvious to galaxy-brain absurd. Reaction of mock enlightenment; emotion is escalating smugness. Fits levels of expertise, progressions, and increasingly unhinged best practices.",
    meme_metadata: ["levels", "progression", "enlightenment", "comparison", "expertise", "funny"],
  },
  {
    id: "doge",
    meme: "Doge",
    meme_url: "https://i.imgflip.com/4t0m5.jpg",
    meme_description:
      "A Shiba Inu surrounded by broken-English inner monologue ('such wow'). The joke is simple amazed commentary in meme-speak. Reaction of wholesome wonder; emotion is happy amusement. Fits simple joys, pleasant surprises, and wholesome product moments.",
    meme_metadata: ["wholesome", "amazement", "joy", "simple", "reaction", "happy"],
  },
  {
    id: "crying-jordan",
    meme: "Crying Jordan",
    meme_url: "https://i.imgflip.com/1k59.jpg",
    meme_description:
      "Michael Jordan's tearful face superimposed onto someone after a failure. The joke is public humiliation after a big loss or mistake. Reaction of exaggerated sorrow; emotion is comic sadness and schadenfreude. Fits epic fails, missed deadlines, and painful lessons.",
    meme_metadata: ["fail", "loss", "sad", "lesson", "reaction", "funny"],
  },
];
