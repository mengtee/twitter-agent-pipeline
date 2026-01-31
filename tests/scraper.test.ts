import { describe, it, expect } from "vitest";
import {
  parseGrokResponse,
  buildUserPrompt,
  getFromDate,
  extractHandles,
} from "../src/scraper/grok-scraper.js";
import {
  deduplicateTweets,
} from "../src/scraper/store.js";
import type { ScrapedTweet, SearchConfig } from "../src/types.js";

// --- parseGrokResponse ---

describe("parseGrokResponse", () => {
  it("parses a valid JSON array of tweets", () => {
    const json = JSON.stringify([
      {
        id: "123",
        text: "Bitcoin pumping",
        author: "CryptoGuy",
        handle: "@cryptoguy",
        likes: 500,
        retweets: 100,
        views: 5000,
        replies: 20,
        url: "https://x.com/cryptoguy/status/123",
        postedAt: "2026-01-30T06:00:00Z",
      },
      {
        id: "456",
        text: "Polymarket whale alert",
        author: "WhaleBot",
        handle: "@whalebot",
        likes: 200,
        retweets: 50,
        views: 3000,
        replies: 10,
        url: "https://x.com/whalebot/status/456",
        postedAt: "2026-01-30T05:00:00Z",
      },
    ]);

    const tweets = parseGrokResponse(json, "test-search");
    expect(tweets).toHaveLength(2);
    expect(tweets[0].id).toBe("123");
    expect(tweets[0].searchName).toBe("test-search");
    expect(tweets[0].scrapedAt).toBeTruthy();
    expect(tweets[1].views).toBe(3000);
  });

  it("handles markdown code fences around JSON", () => {
    const json = `\`\`\`json
[
  {
    "id": "789",
    "text": "test tweet",
    "author": "Test",
    "handle": "@test",
    "likes": 10,
    "retweets": 5,
    "views": 1000,
    "replies": 2,
    "url": "https://x.com/test/status/789",
    "postedAt": "2026-01-30T06:00:00Z"
  }
]
\`\`\``;

    const tweets = parseGrokResponse(json, "test");
    expect(tweets).toHaveLength(1);
    expect(tweets[0].id).toBe("789");
  });

  it("returns empty array for non-JSON response", () => {
    const tweets = parseGrokResponse("Sorry, I could not find any tweets.", "test");
    expect(tweets).toEqual([]);
  });

  it("returns empty array for empty JSON array", () => {
    const tweets = parseGrokResponse("[]", "test");
    expect(tweets).toEqual([]);
  });

  it("skips malformed tweets but keeps valid ones", () => {
    const json = JSON.stringify([
      {
        id: "good",
        text: "valid tweet",
        author: "Author",
        handle: "@author",
        likes: 10,
        retweets: 5,
        views: 1000,
        replies: 2,
        url: "https://x.com/author/status/good",
        postedAt: "2026-01-30T06:00:00Z",
      },
      {
        // missing required fields
        id: "bad",
        text: "incomplete tweet",
      },
    ]);

    const tweets = parseGrokResponse(json, "test");
    expect(tweets).toHaveLength(1);
    expect(tweets[0].id).toBe("good");
  });

  it("defaults missing engagement metrics to 0", () => {
    const json = JSON.stringify([
      {
        id: "no-metrics",
        text: "tweet without metrics",
        author: "Author",
        handle: "@author",
        url: "https://x.com/author/status/no-metrics",
        postedAt: "2026-01-30T06:00:00Z",
      },
    ]);

    const tweets = parseGrokResponse(json, "test");
    expect(tweets).toHaveLength(1);
    expect(tweets[0].likes).toBe(0);
    expect(tweets[0].retweets).toBe(0);
    expect(tweets[0].views).toBe(0);
  });
});

// --- buildUserPrompt ---

describe("buildUserPrompt", () => {
  it("includes time window in prompt", () => {
    const config: SearchConfig = {
      name: "test",
      prompt: "Show me trending tweets",
      timeWindow: "12h",
      maxResults: 20,
    };
    const prompt = buildUserPrompt(config);
    expect(prompt).toContain("last 12h");
    expect(prompt).toContain("Max results: 20");
  });

  it("includes engagement filters when set", () => {
    const config: SearchConfig = {
      name: "test",
      prompt: "crypto tweets",
      timeWindow: "24h",
      minViews: 1000,
      minLikes: 50,
      maxResults: 10,
    };
    const prompt = buildUserPrompt(config);
    expect(prompt).toContain("more than 1000 views");
    expect(prompt).toContain("more than 50 likes");
  });

  it("omits filters when not set", () => {
    const config: SearchConfig = {
      name: "test",
      prompt: "just a search",
      timeWindow: "24h",
      maxResults: 10,
    };
    const prompt = buildUserPrompt(config);
    expect(prompt).not.toContain("Filter:");
  });
});

// --- getFromDate ---

describe("getFromDate", () => {
  it("returns a date string in YYYY-MM-DD format", () => {
    const result = getFromDate("24h");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns today's date for 1h window", () => {
    // 1h ago should be today (or yesterday near midnight, but always valid date)
    const result = getFromDate("1h");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns a date 7 days ago for 7d window", () => {
    const result = getFromDate("7d");
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    expect(result).toBe(sevenDaysAgo.toISOString().split("T")[0]);
  });
});

// --- extractHandles ---

describe("extractHandles", () => {
  it("extracts handles from prompt text", () => {
    const handles = extractHandles(
      "Show me tweets from @polymarket @GlydoAlerts @user123"
    );
    expect(handles).toEqual(["polymarket", "GlydoAlerts", "user123"]);
  });

  it("returns undefined when no handles found", () => {
    const handles = extractHandles("Show me trending crypto tweets");
    expect(handles).toBeUndefined();
  });

  it("limits to 10 handles max", () => {
    const prompt = Array.from({ length: 15 }, (_, i) => `@user${i}`).join(" ");
    const handles = extractHandles(prompt);
    expect(handles).toHaveLength(10);
  });
});

// --- deduplicateTweets ---

describe("deduplicateTweets", () => {
  const makeTweet = (id: string, url: string): ScrapedTweet => ({
    id,
    text: `tweet ${id}`,
    author: "Author",
    handle: "@author",
    likes: 10,
    retweets: 5,
    views: 1000,
    replies: 2,
    url,
    postedAt: "2026-01-30T06:00:00Z",
    scrapedAt: "2026-01-30T07:00:00Z",
    searchName: "test",
  });

  it("filters out already-seen tweets", () => {
    const seen = new Set(["https://x.com/a/status/1"]);
    const tweets = [
      makeTweet("1", "https://x.com/a/status/1"),
      makeTweet("2", "https://x.com/a/status/2"),
    ];
    const result = deduplicateTweets(tweets, seen);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });

  it("adds new URLs to the seen set", () => {
    const seen = new Set<string>();
    const tweets = [
      makeTweet("1", "https://x.com/a/status/1"),
      makeTweet("2", "https://x.com/a/status/2"),
    ];
    deduplicateTweets(tweets, seen);
    expect(seen.size).toBe(2);
    expect(seen.has("https://x.com/a/status/1")).toBe(true);
  });

  it("deduplicates within the same batch", () => {
    const seen = new Set<string>();
    const tweets = [
      makeTweet("1", "https://x.com/a/status/1"),
      makeTweet("1-dup", "https://x.com/a/status/1"), // same URL
    ];
    const result = deduplicateTweets(tweets, seen);
    expect(result).toHaveLength(1);
  });

  it("returns all tweets when none are seen", () => {
    const seen = new Set<string>();
    const tweets = [
      makeTweet("1", "https://x.com/a/status/1"),
      makeTweet("2", "https://x.com/a/status/2"),
      makeTweet("3", "https://x.com/a/status/3"),
    ];
    const result = deduplicateTweets(tweets, seen);
    expect(result).toHaveLength(3);
  });
});
