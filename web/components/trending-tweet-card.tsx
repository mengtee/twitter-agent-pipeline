"use client";

import { cn } from "@/lib/utils";
import type { TrendingTweet } from "@pipeline/types.js";

/** Strip t.co links from tweet text for cleaner display */
function cleanTweetText(text: string): string {
  return text.replace(/\s*https?:\/\/t\.co\/\w+/g, "").trim();
}

/** Format large numbers compactly */
function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

interface TrendingTweetCardProps {
  tweet: TrendingTweet;
  onClick?: () => void;
}

export function TrendingTweetCard({ tweet, onClick }: TrendingTweetCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left p-2.5 rounded-lg border border-zinc-800 bg-zinc-900/50",
        "hover:border-zinc-700 hover:bg-zinc-900 transition-colors",
        "focus:outline-none focus:ring-1 focus:ring-blue-500/50"
      )}
    >
      {/* Rank badge */}
      {tweet.rank && (
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className={cn(
              "text-[10px] font-bold px-1.5 py-0.5 rounded",
              tweet.rank === 1 && "bg-amber-500/20 text-amber-400",
              tweet.rank === 2 && "bg-zinc-400/20 text-zinc-300",
              tweet.rank === 3 && "bg-amber-700/20 text-amber-600",
              tweet.rank > 3 && "bg-zinc-800 text-zinc-500"
            )}
          >
            #{tweet.rank}
          </span>
          <span className="text-[10px] text-zinc-500">
            {formatNumber(tweet.engagementScore)} score
          </span>
        </div>
      )}

      {/* Author */}
      <div className="flex items-center gap-1.5 text-xs mb-1">
        <span className="font-medium text-zinc-300 truncate">
          @{tweet.handle}
        </span>
        <span className="text-zinc-600">·</span>
        <span className="text-zinc-500 truncate">
          {tweet.sourceType === "handle" ? "Following" : tweet.searchName}
        </span>
      </div>

      {/* Tweet text */}
      <p className="text-xs text-zinc-400 line-clamp-2 mb-1.5">
        {cleanTweetText(tweet.text)}
      </p>

      {/* Engagement metrics */}
      <div className="flex items-center gap-2 text-[10px] text-zinc-600">
        <span>{formatNumber(tweet.views)} views</span>
        <span>·</span>
        <span>{formatNumber(tweet.likes)} likes</span>
        <span>·</span>
        <span>{formatNumber(tweet.retweets)} RTs</span>
      </div>
    </button>
  );
}
