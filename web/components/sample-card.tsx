import { cn } from "@/lib/utils";
import type { SessionSample } from "@pipeline/types.js";

interface SampleCardProps {
  sample: SessionSample;
  index: number;
  chosen: boolean;
  onChoose: (id: string) => void;
}

export function SampleCard({
  sample,
  index,
  chosen,
  onChoose,
}: SampleCardProps) {
  const charCount = sample.text.length;
  const isOverLimit = charCount > 280;

  return (
    <div
      className={cn(
        "rounded-lg border p-4 transition-colors",
        chosen
          ? "border-green-500/30 bg-green-500/5"
          : "border-zinc-800 bg-zinc-900"
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-zinc-500">
          Variation {index + 1}
        </span>
        <span className="text-xs text-amber-400">
          {sample.confidence}/10
        </span>
      </div>
      <p className="text-sm text-zinc-200 whitespace-pre-wrap mb-3">
        {sample.text}
      </p>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <span className={isOverLimit ? "text-red-400" : ""}>
            {charCount}/280
          </span>
          {sample.hashtags.length > 0 && (
            <span>{sample.hashtags.map((t) => `#${t}`).join(" ")}</span>
          )}
        </div>
        {!chosen ? (
          <button
            onClick={() => onChoose(sample.id)}
            className="px-3 py-1.5 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-500 transition-colors"
          >
            Choose This
          </button>
        ) : (
          <span className="px-3 py-1.5 text-xs font-medium rounded bg-green-900/30 text-green-400">
            Chosen
          </span>
        )}
      </div>
    </div>
  );
}
