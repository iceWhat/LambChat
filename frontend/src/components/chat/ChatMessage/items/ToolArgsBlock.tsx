import type { ReactNode } from "react";

type ToolArgsBlockSize = "detail" | "compact";

const sizeClasses: Record<ToolArgsBlockSize, string> = {
  detail:
    "tool-args-block group/args relative flex items-center gap-2 px-3 py-2 rounded-lg bg-theme-bg-subtle text-sm text-theme-text-tertiary font-mono",
  compact:
    "tool-args-block group/args relative flex items-center gap-2 mb-2 px-2 py-1.5 rounded-md bg-theme-bg-subtle text-xs text-theme-text-tertiary font-mono",
};

export function ToolArgsBlock({
  children,
  className = "",
  size,
  wrap = false,
}: {
  children: ReactNode;
  className?: string;
  size: ToolArgsBlockSize;
  wrap?: boolean;
}) {
  return (
    <div
      className={[sizeClasses[size], wrap ? "flex-wrap" : "", className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
