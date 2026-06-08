import type { ReactNode } from "react";

export function McpSelectorEmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="py-3 text-center text-xs text-stone-400 dark:text-stone-500">
      {children}
    </div>
  );
}
