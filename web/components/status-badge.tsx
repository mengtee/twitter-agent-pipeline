import { cn } from "@/lib/utils";

const statusStyles: Record<string, string> = {
  // Queue statuses
  scraped: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  generated: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  reviewed: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  approved: "bg-green-500/10 text-green-400 border-green-500/20",
  posted: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  // Session stages
  created: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  selected: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  completed: "bg-green-500/10 text-green-400 border-green-500/20",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "text-xs px-2 py-0.5 rounded border font-medium capitalize",
        statusStyles[status] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"
      )}
    >
      {status}
    </span>
  );
}
