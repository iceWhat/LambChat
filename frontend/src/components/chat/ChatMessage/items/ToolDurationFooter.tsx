import { Clock } from "lucide-react";
import { formatToolDuration, getToolDurationSeconds } from "./toolDuration";

export function ToolDurationFooter({
  startedAt,
  completedAt,
}: {
  startedAt?: string;
  completedAt?: string;
}) {
  const seconds = getToolDurationSeconds(startedAt, completedAt);
  if (seconds === null) return undefined;

  return (
    <div className="tool-duration-footer">
      <Clock size={11} className="tool-duration-footer__icon shrink-0" />
      <span className="tool-duration-footer__text">
        {formatToolDuration(seconds)}
      </span>
    </div>
  );
}
