import { describe, it, expect } from "vitest";
import {
  buildSystemPrompt,
  buildTweetPrompt,
} from "../src/processor/prompt-builder.js";
import { parseRewriteResponse } from "../src/processor/rewriter.js";
import type { PersonaConfig, ScrapedTweet } from "../src/types.js";

const testPersona: PersonaConfig = {
  name: "TestGuy",
  bio: "A test persona for unit tests.",
  voice: {
    tone: "casual, witty",
    vocabulary: ["based", "no cap"],
    avoid: ["slurs"],
    style: "short punchy sentences",
  },
  topics: {
    interests: ["crypto", "tech"],
    expertise: ["trading"],
    avoid: ["politics"],
  },
  rules: ["Never copy verbatim", "Keep under 280 chars"],
  examples: [
    {
      original: "Bitcoin hit $100K",
      rewritten: "told y'all $100K was coming",
    },
  ],
};

const testTweet: ScrapedTweet = {
  id: "123",
  text: "Bitcoin just hit a new ATH of $100K. This is massive.",
  author: "CryptoGuy",
  handle: "@cryptoguy",
  likes: 500,
  retweets: 100,
  views: 5000,
  replies: 20,
  url: "https://x.com/cryptoguy/status/123",
  postedAt: "2026-01-30T06:00:00Z",
  scrapedAt: "2026-01-30T07:00:00Z",
  searchName: "test",
};

// --- buildSystemPrompt ---

describe("buildSystemPrompt", () => {
  it("includes persona name and bio", () => {
    const prompt = buildSystemPrompt(testPersona);
    expect(prompt).toContain("You are TestGuy");
    expect(prompt).toContain("A test persona for unit tests.");
  });

  it("includes voice details", () => {
    const prompt = buildSystemPrompt(testPersona);
    expect(prompt).toContain("casual, witty");
    expect(prompt).toContain("short punchy sentences");
    expect(prompt).toContain("based, no cap");
    expect(prompt).toContain("slurs");
  });

  it("includes topics", () => {
    const prompt = buildSystemPrompt(testPersona);
    expect(prompt).toContain("crypto, tech");
    expect(prompt).toContain("trading");
    expect(prompt).toContain("politics");
  });

  it("includes rules", () => {
    const prompt = buildSystemPrompt(testPersona);
    expect(prompt).toContain("Never copy verbatim");
    expect(prompt).toContain("Keep under 280 chars");
  });

  it("includes examples", () => {
    const prompt = buildSystemPrompt(testPersona);
    expect(prompt).toContain("Bitcoin hit $100K");
    expect(prompt).toContain("told y'all $100K was coming");
  });

  it("includes JSON output format instructions", () => {
    const prompt = buildSystemPrompt(testPersona);
    expect(prompt).toContain('"rewritten"');
    expect(prompt).toContain('"confidence"');
    expect(prompt).toContain('"hashtags"');
  });
});

// --- buildTweetPrompt ---

describe("buildTweetPrompt", () => {
  it("includes tweet text and author", () => {
    const prompt = buildTweetPrompt(testTweet);
    expect(prompt).toContain("@cryptoguy");
    expect(prompt).toContain("CryptoGuy");
    expect(prompt).toContain("Bitcoin just hit a new ATH");
  });

  it("includes engagement metrics", () => {
    const prompt = buildTweetPrompt(testTweet);
    expect(prompt).toContain("5000 views");
    expect(prompt).toContain("500 likes");
    expect(prompt).toContain("100 RTs");
  });

  it("includes source URL", () => {
    const prompt = buildTweetPrompt(testTweet);
    expect(prompt).toContain("https://x.com/cryptoguy/status/123");
  });
});

// --- parseRewriteResponse ---

describe("parseRewriteResponse", () => {
  it("parses valid JSON response", () => {
    const json = JSON.stringify({
      rewritten: "my hot take on this",
      confidence: 8,
      hashtags: ["crypto", "btc"],
    });
    const result = parseRewriteResponse(json);
    expect(result.rewritten).toBe("my hot take on this");
    expect(result.confidence).toBe(8);
    expect(result.hashtags).toEqual(["crypto", "btc"]);
  });

  it("handles markdown code fences", () => {
    const json = `\`\`\`json\n{"rewritten": "test tweet", "confidence": 7, "hashtags": []}\n\`\`\``;
    const result = parseRewriteResponse(json);
    expect(result.rewritten).toBe("test tweet");
    expect(result.confidence).toBe(7);
  });

  it("handles plain text fallback", () => {
    const result = parseRewriteResponse("just a plain text tweet no json");
    expect(result.rewritten).toBe("just a plain text tweet no json");
    expect(result.confidence).toBe(5);
    expect(result.hashtags).toEqual([]);
  });

  it("handles skip response (confidence 0)", () => {
    const json = JSON.stringify({
      rewritten: "",
      confidence: 0,
      hashtags: [],
    });
    const result = parseRewriteResponse(json);
    expect(result.rewritten).toBe("");
    expect(result.confidence).toBe(0);
  });

  it("handles missing fields gracefully", () => {
    const json = JSON.stringify({ rewritten: "partial response" });
    const result = parseRewriteResponse(json);
    expect(result.rewritten).toBe("partial response");
    expect(result.confidence).toBe(0);
    expect(result.hashtags).toEqual([]);
  });
});
