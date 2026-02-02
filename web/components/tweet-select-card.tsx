import { cn } from "@/lib/utils";
import type { ScrapedTweet } from "@pipeline/types.js";

interface TweetSelectCardProps {
  tweet: ScrapedTweet;
  selected: boolean;
  onToggle: (id: string) => void;
}

export function TweetSelectCard({
  tweet,
  selected,
  onToggle,
}: TweetSelectCardProps) {
  return (
    <label
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
        selected
          ? "border-blue-500/30 bg-blue-500/5"
          : "border-zinc-800 hover:border-zinc-700"
      )}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(tweet.id)}
        className="mt-1 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
          <span className="font-medium text-zinc-400">
            {tweet.handle.startsWith("@") ? tweet.handle : `@${tweet.handle}`}
          </span>
          <span>&middot;</span>
          <span>{tweet.views.toLocaleString()} views</span>
          <span>&middot;</span>
          <span>{tweet.likes.toLocaleString()} likes</span>
          <span>&middot;</span>
          <span>{tweet.retweets.toLocaleString()} RTs</span>
        </div>
        <p className="text-sm text-zinc-300 whitespace-pre-wrap line-clamp-3">
          {tweet.text}
        </p>
        <div className="flex items-center gap-2 text-xs text-zinc-600 mt-1">
          <span>{tweet.searchName}</span>
          {tweet.url && (
            <a
              href={tweet.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-blue-500 hover:text-blue-400 transition-colors"
            >
              View on X ↗
            </a>
          )}
        </div>
      </div>
    </label>
  );
}
