import { describe, it, expect } from "vitest";
import {
  addScrapedToQueue,
  markGenerated,
  updateStatus,
  getByStatus,
} from "../src/output/queue.js";
import { formatQueueItem, formatQueueSummary, formatPreview } from "../src/output/display.js";
import type { QueueItem, ScrapedTweet } from "../src/types.js";

function makeTweet(id: string): ScrapedTweet {
  return {
    id,
    text: `Tweet ${id} content here`,
    author: "Author",
    handle: "@author",
    likes: 100,
    retweets: 50,
    views: 5000,
    replies: 10,
    url: `https://x.com/author/status/${id}`,
    postedAt: "2026-01-30T06:00:00Z",
    scrapedAt: "2026-01-30T07:00:00Z",
    searchName: "test",
  };
}

function makeQueueItem(
  id: string,
  status: "scraped" | "generated" | "approved" = "scraped"
): QueueItem {
  return {
    id,
    status,
    scrapedTweet: makeTweet(id),
    hashtags: [],
    createdAt: "2026-01-30T07:00:00Z",
    updatedAt: "2026-01-30T07:00:00Z",
  };
}

// --- addScrapedToQueue ---

describe("addScrapedToQueue", () => {
  it("adds tweets to empty queue", () => {
    const queue: QueueItem[] = [];
    const tweets = [makeTweet("1"), makeTweet("2")];
    addScrapedToQueue(queue, tweets);
    expect(queue).toHaveLength(2);
    expect(queue[0].status).toBe("scraped");
    expect(queue[0].scrapedTweet.id).toBe("1");
  });

  it("does not add duplicates by URL", () => {
    const existing = makeQueueItem("1");
    const queue: QueueItem[] = [existing];
    const tweets = [makeTweet("1"), makeTweet("2")];
    addScrapedToQueue(queue, tweets);
    expect(queue).toHaveLength(2); // 1 existing + 1 new
  });

  it("assigns unique IDs to new items", () => {
    const queue: QueueItem[] = [];
    addScrapedToQueue(queue, [makeTweet("1"), makeTweet("2")]);
    expect(queue[0].id).not.toBe(queue[1].id);
  });
});

// --- markGenerated ---

describe("markGenerated", () => {
  it("updates status and adds rewrite data", () => {
    const queue = [makeQueueItem("1")];
    markGenerated(
      queue,
      "https://x.com/author/status/1",
      "rewritten text",
      8,
      ["crypto"]
    );
    expect(queue[0].status).toBe("generated");
    expect(queue[0].rewrittenTweet).toBe("rewritten text");
    expect(queue[0].confidence).toBe(8);
    expect(queue[0].hashtags).toEqual(["crypto"]);
  });

  it("does nothing for unknown URL", () => {
    const queue = [makeQueueItem("1")];
    markGenerated(queue, "https://x.com/unknown/status/999", "text", 5, []);
    expect(queue[0].status).toBe("scraped");
  });
});

// --- updateStatus ---

describe("updateStatus", () => {
  it("updates status by ID", () => {
    const queue = [makeQueueItem("abc")];
    queue[0].id = "abc";
    const result = updateStatus(queue, "abc", "approved");
    expect(result).toBe(true);
    expect(queue[0].status).toBe("approved");
  });

  it("returns false for unknown ID", () => {
    const queue = [makeQueueItem("abc")];
    const result = updateStatus(queue, "xyz", "approved");
    expect(result).toBe(false);
  });
});

// --- getByStatus ---

describe("getByStatus", () => {
  it("filters by status", () => {
    const queue = [
      makeQueueItem("1", "scraped"),
      makeQueueItem("2", "generated"),
      makeQueueItem("3", "scraped"),
      makeQueueItem("4", "approved"),
    ];
    expect(getByStatus(queue, "scraped")).toHaveLength(2);
    expect(getByStatus(queue, "generated")).toHaveLength(1);
    expect(getByStatus(queue, "approved")).toHaveLength(1);
    expect(getByStatus(queue, "posted")).toHaveLength(0);
  });
});

// --- display ---

describe("formatQueueItem", () => {
  it("shows original tweet details", () => {
    const item = makeQueueItem("1");
    const output = formatQueueItem(item, 0);
    expect(output).toContain("@author");
    expect(output).toContain("5000 views");
    expect(output).toContain("SCRAPED");
  });

  it("shows rewritten tweet when present", () => {
    const item = makeQueueItem("1", "generated");
    item.rewrittenTweet = "my hot take here";
    item.confidence = 8;
    const output = formatQueueItem(item, 0);
    expect(output).toContain("REWRITTEN");
    expect(output).toContain("my hot take here");
    expect(output).toContain("8/10");
  });
});

describe("formatQueueSummary", () => {
  it("counts items by status", () => {
    const queue = [
      makeQueueItem("1", "scraped"),
      makeQueueItem("2", "generated"),
      makeQueueItem("3", "generated"),
      makeQueueItem("4", "approved"),
    ];
    const output = formatQueueSummary(queue);
    expect(output).toContain("4 total");
    expect(output).toContain("Scraped:   1");
    expect(output).toContain("Generated: 2");
    expect(output).toContain("Approved:  1");
  });
});

describe("formatPreview", () => {
  it("shows status and truncated text", () => {
    const item = makeQueueItem("1");
    const output = formatPreview(item);
    expect(output).toContain("scraped");
    expect(output).toContain("Tweet 1 content here");
  });

  it("prefers rewritten text when available", () => {
    const item = makeQueueItem("1", "generated");
    item.rewrittenTweet = "rewritten version";
    const output = formatPreview(item);
    expect(output).toContain("rewritten version");
  });
});
