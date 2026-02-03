import { cn } from "@/lib/utils";
import type { SessionStage } from "@pipeline/types.js";

const stages: { key: SessionStage; label: string }[] = [
  { key: "created", label: "Scrape" },
  { key: "scraped", label: "Analyze" },
  { key: "analyzed", label: "Select" },
  { key: "selected", label: "Generate" },
  { key: "generated", label: "Choose" },
  { key: "completed", label: "Done" },
];

const stageIndex = (stage: SessionStage) =>
  stages.findIndex((s) => s.key === stage);

interface StageIndicatorProps {
  current: SessionStage;
  onStageClick?: (stage: SessionStage) => void;
}

export function StageIndicator({ current, onStageClick }: StageIndicatorProps) {
  const currentIdx = stageIndex(current);

  return (
    <div className="flex items-center gap-1">
      {stages.map((s, i) => {
        const isCompleted = i < currentIdx;
        const isCurrent = i === currentIdx;
        const isClickable = isCompleted && !!onStageClick;
        return (
          <div key={s.key} className="flex items-center gap-1">
            {i > 0 && (
              <span
                className={cn(
                  "w-6 h-px",
                  isCompleted ? "bg-green-500" : "bg-zinc-700"
                )}
              />
            )}
            <button
              type="button"
              disabled={!isClickable}
              onClick={() => isClickable && onStageClick(s.key)}
              className={cn(
                "px-2.5 py-1 rounded text-xs font-medium border transition-colors",
                isCompleted &&
                  "bg-green-500/10 text-green-400 border-green-500/20",
                isCompleted &&
                  isClickable &&
                  "cursor-pointer hover:bg-green-500/20",
                isCurrent &&
                  "bg-blue-500/10 text-blue-400 border-blue-500/20",
                !isCompleted &&
                  !isCurrent &&
                  "bg-zinc-800 text-zinc-500 border-zinc-700",
                !isClickable && !isCurrent && "cursor-default"
              )}
            >
              {s.label}
            </button>
          </div>
        );
      })}
    </div>
  );
}
