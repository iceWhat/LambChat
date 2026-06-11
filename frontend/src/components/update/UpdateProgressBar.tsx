import { useTranslation } from "react-i18next";

interface UpdateProgressBarProps {
  progress: number;
  downloaded: number;
  contentLength: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UpdateProgressBar({
  progress,
  downloaded,
  contentLength,
}: UpdateProgressBarProps) {
  const { t } = useTranslation();

  const percent = Math.min(Math.round(progress), 100);
  const downloadedStr = formatBytes(downloaded);
  const totalStr = contentLength > 0 ? formatBytes(contentLength) : "?";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
        <span>{t("updateDownloading", "正在下载...")}</span>
        <span>
          {downloadedStr} / {totalStr} — {percent}%
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
        <div
          className="h-full rounded-full bg-[var(--theme-primary)] transition-all duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
