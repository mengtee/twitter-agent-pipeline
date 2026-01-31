# Twitter Content Pipeline — Implementation Plan

## Overview

Automated pipeline: **Scrape trending tweets** → **Rewrite with character voice (Claude)** → **Output for posting**

## Architecture

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────────┐
│  Tweet       │    │  Content     │    │  LLM        │    │  Output      │
│  Scraper     │───▶│  Filter &    │───▶│  Rewriter   │───▶│  Queue       │
│  (Grok API)  │    │  Selector    │    │  (Claude)   │    │  (JSON/CLI)  │
└─────────────┘    └──────────────┘    └─────────────┘    └──────────────┘
       │                                      │
       ▼                                      ▼
  Config: accounts,              Config: persona.json
  categories, search terms       (character, tone, rules)
```

## Key Technical Decisions

### Scraping Strategy: Grok API with X Search Tool

**Why Grok API over X API Basic ($100/mo):**
- Grok API's X Search tool costs ~$5/1,000 calls — at 100 searches/day, that's ~$15/mo
- Token costs are minimal (Grok 4.1 Fast: $0.20/$0.50 per million tokens)
- Total estimated cost: **$20-50/month** for scraping (vs $100/mo X API Basic)
- Built-in search with no separate auth or rate-limit management
- Stays well within the $200-500/mo budget, leaving room for Claude API costs

**Fallback:** X API Basic tier ($100/mo) if Grok X Search quality is insufficient

### LLM Rewriting: Claude API (Anthropic)

- Claude Sonnet for cost-effective rewriting (~$3/$15 per million tokens)
- Persona/character system via structured system prompts
- User-configurable prompt templates

### Tech Stack

- **Runtime:** Node.js + TypeScript
- **HTTP:** `axios` for API calls
- **Storage:** Local JSON files (no DB needed for MVP)
- **CLI:** `commander` for CLI interface
- **Config:** `.env` + JSON config files
- **Testing:** `vitest`

---

## Stage 1: Project Scaffolding

**Goal:** Working TypeScript project with configs, structure, and a hello-world CLI

**Success Criteria:**
- `npm run build` compiles without errors
- `npm run dev` runs the CLI entry point
- `.env.example` documents required API keys
- Project structure supports modular pipeline stages

**Deliverables:**
```
twitter-agent-pipeline/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── config.ts             # Env + config loading
│   ├── scraper/              # Stage 2
│   ├── processor/            # Stage 3-4
│   └── output/               # Stage 5
├── config/
│   ├── searches.json         # Search queries (natural language prompts)
│   └── persona.json          # Character/voice config
├── data/
│   └── .gitkeep              # Scraped tweets + generated output
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
└── vitest.config.ts
```

**Tests:**
- Config loader reads `.env` values
- Config loader validates required keys exist

**Status:** Complete

---

## Stage 2: Tweet Scraper Module

**Goal:** Fetch trending tweets by topic/account via Grok API natural language search

**Success Criteria:**
- Can search tweets by topic (e.g., "prediction markets", "crypto trading")
- Can search tweets by specific accounts (e.g., "from @polymarket")
- Can filter by engagement (views, likes, retweets) via prompt refinement
- Can filter by recency (last 1h, 12h, 24h, 7d)
- Returns structured tweet data with URLs
- Handles rate limits and errors gracefully
- Deduplicates against previously scraped tweets

**How It Actually Works (Based on Real Grok Usage):**

The scraper sends natural language prompts to Grok's chat completions API with
the `x_search` tool enabled. Grok internally searches X and returns results.
We instruct Grok to return **structured JSON** instead of prose.

Example prompt flow:
```
System: You are a tweet research assistant. Return results as a JSON array.
Each tweet object must include: author, handle, text, likes, retweets,
views, url, posted_at. Only include tweets matching the criteria.

User: Find trending tweets about "Prediction Markets" from the last 12 hours
with more than 1000 views. Include direct tweet links.
```

Grok uses its built-in X Search tool (~$5/1,000 calls) and returns structured
data we can parse directly.

**Search Config (user-editable):**
```jsonc
// config/searches.json
{
  "searches": [
    {
      "name": "prediction-markets",
      "prompt": "Show me trending tweets about Prediction Markets",
      "timeWindow": "12h",
      "minViews": 1000,
      "minLikes": 10,
      "maxResults": 20
    },
    {
      "name": "crypto-alpha",
      "prompt": "Show me tweets about crypto trading alpha and market analysis",
      "timeWindow": "24h",
      "minViews": 500,
      "maxResults": 15
    },
    {
      "name": "specific-accounts",
      "prompt": "Show me latest tweets from @polymarket @kalaboraXYZ @GlydoAlerts",
      "timeWindow": "24h",
      "maxResults": 10
    }
  ]
}
```

Users write searches in plain English — the same way they'd type into Grok chat.
The system wraps it with structured output instructions and engagement filters.

**Implementation:**
```typescript
// src/scraper/grok-scraper.ts
interface ScrapedTweet {
  id: string;
  text: string;
  author: string;
  handle: string;
  likes: number;
  retweets: number;
  views: number;
  replies: number;
  url: string;            // e.g., https://x.com/user/status/123
  postedAt: string;
  scrapedAt: string;
  searchName: string;     // which search config produced this
}

interface SearchConfig {
  name: string;
  prompt: string;              // natural language search query
  timeWindow: '1h' | '12h' | '24h' | '7d';
  minViews?: number;
  minLikes?: number;
  maxResults: number;
}
```

**API approach:**
- Use Grok API (`https://api.x.ai/v1/chat/completions`) with model `grok-3`
- System prompt instructs JSON-only output with tweet schema
- User prompt = search config prompt + time/engagement filters
- Parse JSON response into `ScrapedTweet[]`
- Deduplicate by tweet URL against `data/seen.json`
- Save new tweets to `data/scraped/{searchName}_{timestamp}.json`

**Multi-turn refinement (future):**
If initial results are insufficient, send follow-up messages in the same
conversation (e.g., "Now show me ones with more engagement" or "Include
tweet links"). The Grok API supports multi-turn chat.

**Tests:**
- JSON response parsing (valid + malformed responses)
- Deduplication logic (by URL)
- Search config validation
- Engagement threshold filtering
- Error handling (API errors, rate limits, empty results)

**Status:** Complete

---

## Stage 3: Persona & Prompt System

**Goal:** User-configurable character/voice system that drives LLM rewriting

**Success Criteria:**
- Persona config is a simple JSON file anyone can edit
- Supports tone, vocabulary, topics, constraints
- Prompt templates are composable (system prompt + per-tweet instructions)
- User can preview their persona config before running pipeline

**Deliverables:**
```jsonc
// config/persona.json
{
  "name": "Guts",
  "bio": "Short description of the character",
  "voice": {
    "tone": "casual, witty, slightly provocative",
    "vocabulary": ["based", "fr fr", "no cap"],
    "avoid": ["offensive slurs", "political extremes"],
    "style": "short punchy sentences, occasional thread format"
  },
  "topics": {
    "interests": ["crypto", "tech", "startups"],
    "expertise": ["trading", "market analysis"],
    "avoid": ["politics", "religion"]
  },
  "rules": [
    "Never copy tweets verbatim — always transform the idea",
    "Add personal angle or hot take",
    "Keep under 280 characters unless doing a thread",
    "Use emojis sparingly"
  ],
  "examples": [
    {
      "original": "Bitcoin just hit a new ATH of $100K",
      "rewritten": "told y'all $100K was inevitable. the real question is who's still sitting on the sidelines watching"
    }
  ]
}
```

**Implementation:**
- `src/processor/persona.ts` — loads and validates persona config
- `src/processor/prompt-builder.ts` — builds Claude system/user prompts from persona + tweet

**Tests:**
- Persona config validation (required fields, types)
- Prompt builder produces valid prompts
- Examples are included in system prompt

**Status:** Not Started

---

## Stage 4: LLM Rewriter (Claude Integration)

**Goal:** Take scraped tweets + persona and produce rewritten tweets via Claude

**Success Criteria:**
- Sends batched tweets to Claude with persona context
- Returns rewritten tweet for each input
- Handles API errors and retries
- Tracks token usage and estimated cost
- Produces output that doesn't plagiarize (transforms ideas, doesn't copy)

**Implementation:**
```typescript
// src/processor/rewriter.ts
interface RewrittenTweet {
  original: ScrapedTweet;
  rewritten: string;
  confidence: number;      // LLM's self-rated quality 1-10
  hashtags: string[];
  suggestedPostTime?: string;
}
```

**Approach:**
- Use Anthropic SDK (`@anthropic-ai/sdk`)
- System prompt = persona + rules + examples
- User prompt = batch of 5-10 scraped tweets
- Ask Claude to return JSON array of rewrites
- Parse and validate response

**Cost estimate:**
- ~500 tokens per tweet (input + output)
- 50 tweets/day = 25K tokens/day
- Claude Sonnet: ~$0.10/day = ~$3/month

**Tests:**
- Prompt construction
- Response parsing
- Error handling / retry logic
- Cost tracking accumulation

**Status:** Not Started

---

## Stage 5: Output Queue & CLI Interface

**Goal:** Review, approve, and manage generated tweets via CLI

**Success Criteria:**
- Generated tweets saved to `data/queue.json`
- CLI commands: `scrape`, `generate`, `review`, `approve`, `run` (full pipeline)
- `review` shows original + rewritten side by side
- `approve` marks tweets as ready to post
- Pipeline can run end-to-end with a single command

**CLI Commands:**
```bash
# Full pipeline
npx tsx src/index.ts run

# Individual stages
npx tsx src/index.ts scrape          # Fetch new tweets
npx tsx src/index.ts generate        # Rewrite scraped tweets
npx tsx src/index.ts review          # Interactive review of generated tweets
npx tsx src/index.ts approve <id>    # Mark a tweet as approved
npx tsx src/index.ts list            # Show queue status
npx tsx src/index.ts config          # Validate and show current config
```

**Queue states:**
```
scraped → generated → reviewed → approved → posted
```

**Implementation:**
- `src/output/queue.ts` — queue management (CRUD on data/queue.json)
- `src/output/display.ts` — formatted CLI output
- `src/index.ts` — commander CLI with subcommands

**Tests:**
- Queue state transitions
- JSON file persistence
- CLI argument parsing

**Status:** Not Started

---

## Budget Breakdown (Estimated Monthly)

| Service            | Cost         | Notes                              |
| ------------------ | ------------ | ---------------------------------- |
| Grok API (scraper) | $20-50       | ~100 X searches/day + tokens       |
| Claude API (LLM)   | $3-10        | ~50 tweets/day rewriting           |
| X API (posting)    | $0           | Free tier supports write (1,500/mo)|
| **Total**          | **$23-60**   | Well within $200-500 budget        |

## Future Enhancements (Out of Scope for MVP)

- Auto-posting via X API free tier (write access)
- Web UI for review/approval (React dashboard)
- Scheduling system (post at optimal times)
- Analytics tracking (engagement on posted tweets)
- Multiple persona support
- A/B testing different voices
- Integration with dedaluslabs.ai for CRM features

## Risk Mitigation

| Risk                                    | Mitigation                                              |
| --------------------------------------- | ------------------------------------------------------- |
| Grok X Search returns low-quality data  | Fallback to X API Basic ($100/mo) or Selenium scraping  |
| X API TOS violation                     | Use official APIs only, no scraping workarounds         |
| Claude produces plagiarized content     | Prompt engineering + similarity check in post-processing |
| Rate limits hit                         | Exponential backoff + daily caps in config              |
| Grok API pricing changes                | Abstract scraper behind interface, swap implementations  |
