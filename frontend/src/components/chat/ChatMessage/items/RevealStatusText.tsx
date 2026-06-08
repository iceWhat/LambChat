import type { ReactNode } from "react";

export function RevealStatusText({
  title,
  subtitle,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium text-stone-700 dark:text-stone-300 truncate">
        {title}
      </div>
      {subtitle != null && (
        <div className="text-xs text-stone-500 dark:text-stone-400 truncate mt-0.5">
          {subtitle}
        </div>
      )}
    </div>
  );
}

export function RevealStatusLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs text-amber-600 dark:text-amber-400">{children}</div>
  );
}
