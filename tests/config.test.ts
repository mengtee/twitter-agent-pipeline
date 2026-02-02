import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SearchesFileSchema,
  PersonaConfigSchema,
  ScrapedTweetSchema,
} from "../src/types.js";

const ROOT = resolve(import.meta.dirname, "..");

describe("searches.json", () => {
  it("parses and validates successfully", () => {
    const raw = readFileSync(resolve(ROOT, "config/searches.json"), "utf-8");
    const result = SearchesFileSchema.parse(JSON.parse(raw));
    expect(result.searches.length).toBeGreaterThan(0);
  });

  it("each search has required fields", () => {
    const raw = readFileSync(resolve(ROOT, "config/searches.json"), "utf-8");
    const { searches } = SearchesFileSchema.parse(JSON.parse(raw));
    for (const s of searches) {
      expect(s.name).toBeTruthy();
      expect(s.prompt).toBeTruthy();
      expect(["1h", "12h", "24h", "7d"]).toContain(s.timeWindow);
      expect(s.maxResults).toBeGreaterThan(0);
    }
  });

  it("rejects invalid search config", () => {
    expect(() =>
      SearchesFileSchema.parse({ searches: [{ name: "" }] })
    ).toThrow();
  });
});

describe("persona.json", () => {
  it("parses and validates successfully", () => {
    const raw = readFileSync(resolve(ROOT, "config/persona.json"), "utf-8");
    const result = PersonaConfigSchema.parse(JSON.parse(raw));
    expect(result.name).toBeTruthy();
    expect(result.voice.tone).toBeTruthy();
  });

  it("has examples for LLM context", () => {
    const raw = readFileSync(resolve(ROOT, "config/persona.json"), "utf-8");
    const result = PersonaConfigSchema.parse(JSON.parse(raw));
    expect(result.examples.length).toBeGreaterThan(0);
    for (const ex of result.examples) {
      expect(ex.original).toBeTruthy();
      expect(ex.rewritten).toBeTruthy();
    }
  });

  it("rejects persona without name", () => {
    expect(() =>
      PersonaConfigSchema.parse({ name: "", bio: "test", voice: {} })
    ).toThrow();
  });
});

describe("ScrapedTweet schema", () => {
  it("validates a well-formed tweet", () => {
    const tweet = {
      id: "123456",
      text: "Bitcoin is pumping",
      author: "CryptoGuy",
      handle: "@cryptoguy",
      likes: 500,
      retweets: 100,
      views: 5000,
      replies: 20,
      url: "https://x.com/cryptoguy/status/123456",
      postedAt: "2026-01-30T06:00:00Z",
      scrapedAt: "2026-01-30T07:00:00Z",
      searchName: "crypto-alpha",
    };
    const result = ScrapedTweetSchema.parse(tweet);
    expect(result.id).toBe("123456");
    expect(result.views).toBe(5000);
  });

  it("defaults missing engagement metrics to 0", () => {
    const tweet = {
      id: "789",
      text: "test",
      author: "test",
      handle: "@test",
      url: "https://x.com/test/status/789",
      postedAt: "2026-01-30T06:00:00Z",
      scrapedAt: "2026-01-30T07:00:00Z",
      searchName: "test",
    };
    const result = ScrapedTweetSchema.parse(tweet);
    expect(result.likes).toBe(0);
    expect(result.retweets).toBe(0);
    expect(result.views).toBe(0);
  });

  it("rejects tweet without URL", () => {
    expect(() =>
      ScrapedTweetSchema.parse({ id: "1", text: "hi" })
    ).toThrow();
  });
});

