import assert from "node:assert";
import { AI_PROVIDERS, getAgent, mastra, resolveModel } from "../lib/mastra";

// router providers resolve to mastra magic strings
for (const p of ["openai", "anthropic", "google", "xai", "openrouter"] as const) {
  assert.strictEqual(resolveModel(p, "test-model"), `${p}/test-model`, p);
}

// ollama + custom resolve to ai-sdk model instances
assert.strictEqual(typeof resolveModel("ollama", "llama3"), "object");
assert.strictEqual(typeof resolveModel("custom", "my-model"), "object");

// media providers are available for configuration/model discovery, but are not
// silently sent through the OpenAI-compatible chat adapter.
for (const p of ["runway", "vertex", "fal", "luma"] as const) {
  assert.throws(() => resolveModel(p, "test-model"), /model discovery only/, p);
}

// agent cache returns the same instance for the same config
const a = getAgent({ provider: "anthropic", model: "claude-test" });
const b = getAgent({ provider: "anthropic", model: "claude-test" });
assert.strictEqual(a, b);

// different configs produce different agents
assert.notStrictEqual(a, getAgent({ provider: "anthropic", model: "other" }));

// the mastra service boots with the default assistant registered
assert.ok(mastra.getAgent("assistant"));

console.log("mastra superservice OK — providers:", AI_PROVIDERS.join(", "));
