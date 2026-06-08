import { memo, useMemo } from "react";
import { clsx } from "clsx";
import {
  CalendarClock,
  Clock,
  CheckCircle2,
  MessageSquare,
  Zap,
  AlertCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { CollapsiblePill } from "../../../common";
import { extractText } from "./toolUtils";
import { openPersistentToolPanel } from "./persistentToolPanelState";
import { ToolArgsBlock } from "./ToolArgsBlock";
import { ToolInlineDetails } from "./ToolInlineDetails";
import { ToolHoverCopyButton } from "./ToolHoverCopyButton";
import { ToolDurationFooter } from "./ToolDurationFooter";
import { DetailSection } from "./DetailSection";

// ── helpers ──────────────────────────────────────────────────────────

function getActionLabel(
  toolName: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const map: Record<string, string> = {
    scheduled_task_create: "chat.message.toolScheduledTaskCreate",
    scheduled_task_list: "chat.message.toolScheduledTaskList",
    scheduled_task_update: "chat.message.toolScheduledTaskUpdate",
    scheduled_task_delete: "chat.message.toolScheduledTaskDelete",
  };
  return t(map[toolName] || "chat.message.toolScheduledTask");
}

function TriggerBadge({
  type,
  t,
}: {
  type: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const styles: Record<string, string> = {
    date: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
    interval: "bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300",
    cron: "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium",
        styles[type] || styles.date,
      )}
    >
      <Clock size={10} className="opacity-70" />
      {t(`scheduledTask.${type}`)}
    </span>
  );
}

function StatusBadge({
  status,
  enabled,
  t,
}: {
  status?: string;
  enabled?: boolean;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  if (!enabled) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-theme-bg-subtle text-theme-text-tertiary text-xs">
        <AlertCircle size={10} />
        {t("scheduledTask.paused")}
      </span>
    );
  }
  const isActive = status === "active" || status === "running";
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium",
        isActive
          ? "bg-emerald-100/80 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
          : "bg-theme-bg-subtle text-theme-text-tertiary",
      )}
    >
      <span
        className={clsx(
          "w-1.5 h-1.5 rounded-full",
          isActive ? "bg-emerald-500" : "bg-stone-400",
        )}
      />
      {t(`scheduledTask.${status || "statusUnknown"}`)}
    </span>
  );
}

function formatSchedule(
  preview: Record<string, unknown> | null | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (!preview) return "";
  const trigger = preview.trigger_type as string | undefined;
  const config = preview.trigger_config as Record<string, unknown> | undefined;
  if (trigger === "interval" && config?.seconds) {
    const s = Number(config.seconds);
    if (s >= 86400)
      return t("scheduledTask.everyDays", { count: Math.round(s / 86400) });
    if (s >= 3600)
      return t("scheduledTask.everyHours", { count: Math.round(s / 3600) });
    if (s >= 60)
      return t("scheduledTask.everyMinutes", { count: Math.round(s / 60) });
    return t("scheduledTask.everySeconds", { count: s });
  }
  if (trigger === "cron" && config) {
    const parts = [
      config.hour,
      config.minute,
      config.day_of_week,
      config.day_of_month,
    ]
      .filter(Boolean)
      .map(String);
    return t("scheduledTask.cronExpr", { expr: parts.join(" ") });
  }
  if (trigger === "date") {
    if (preview.run_at) return String(preview.run_at);
    if (config?.seconds)
      return t("scheduledTask.inSeconds", { seconds: Number(config.seconds) });
    return t("scheduledTask.once");
  }
  return "";
}

function parseResult(result: string | Record<string, unknown> | undefined): {
  task: Record<string, unknown> | null;
  preview: Record<string, unknown> | null;
  message: string;
  tasks: Array<Record<string, unknown>>;
  isList: boolean;
} {
  if (!result)
    return { task: null, preview: null, message: "", tasks: [], isList: false };

  const text = extractText(result);
  if (!text)
    return { task: null, preview: null, message: "", tasks: [], isList: false };

  try {
    const obj = JSON.parse(text);

    // create/update/delete returns { task, preview, message }
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      if (obj.task && typeof obj.task === "object") {
        return {
          task: obj.task as Record<string, unknown>,
          preview: (obj.preview as Record<string, unknown>) || null,
          message: String(obj.message || ""),
          tasks: [],
          isList: false,
        };
      }
      // list returns an array or { tasks: [...] }
      if (Array.isArray(obj)) {
        return {
          task: null,
          preview: null,
          message: "",
          tasks: obj,
          isList: true,
        };
      }
      if (Array.isArray(obj.tasks)) {
        return {
          task: null,
          preview: null,
          message: "",
          tasks: obj.tasks,
          isList: true,
        };
      }
      // single task from get/detail
      if (obj.id && obj.name) {
        return {
          task: obj as Record<string, unknown>,
          preview: null,
          message: "",
          tasks: [],
          isList: false,
        };
      }
    }
  } catch {
    // not JSON
  }

  return { task: null, preview: null, message: text, tasks: [], isList: false };
}

// ── component ──────────────────────────────────────────────────────────

const ScheduledTaskItem = memo(function ScheduledTaskItem({
  toolName,
  args,
  result,
  success,
  isPending,
  cancelled,
  startedAt,
  completedAt,
}: {
  toolName: string;
  args: Record<string, unknown>;
  result?: string | Record<string, unknown>;
  success?: boolean;
  isPending?: boolean;
  cancelled?: boolean;
  startedAt?: string;
  completedAt?: string;
}) {
  const { t } = useTranslation();
  const durationFooter = (
    <ToolDurationFooter startedAt={startedAt} completedAt={completedAt} />
  );

  const actionLabel = getActionLabel(toolName, t);
  const taskName = (args.name as string) || "";
  const triggerType = (args.trigger_type as string) || "";
  const action = (args.action as string) || "";

  const parsed = useMemo(() => parseResult(result), [result]);

  // Merge args + result data
  const task = parsed.task;
  const preview = parsed.preview;
  const resultMessage = parsed.message;
  const isList = parsed.isList;
  const tasks = parsed.tasks;

  const displayName = String(task?.name || taskName || "");
  const taskId = String(task?.id || args.task_id || "");
  const trigger = String(
    task?.trigger_type || triggerType || preview?.trigger_type || "",
  );
  const schedule = formatSchedule(preview, t) || formatSchedule(parsed.task, t);
  const taskMessage = String(
    preview?.message ||
      (task?.input_payload as Record<string, unknown> | undefined)?.message ||
      args.message ||
      "",
  );
  const effect = String(preview?.effect || "");
  const status = typeof task?.status === "string" ? task.status : undefined;
  const enabled = typeof task?.enabled === "boolean" ? task.enabled : undefined;
  const totalRuns =
    typeof task?.total_runs === "number" ? task.total_runs : undefined;

  const canExpand = !!displayName || !!trigger || !!result;
  const pillStatus = isPending
    ? "loading"
    : cancelled
      ? "cancelled"
      : success
        ? "success"
        : "error";

  const labelSuffix = displayName || action || "";

  // ── detail (panel) content ─────────────────────────────────────────

  const detailContent = canExpand && (
    <div className="p-4 sm:p-5 space-y-3">
      {/* Task card (create/update/delete) */}
      {displayName && !isList && (
        <div
          className={clsx(
            "relative flex items-center gap-3 rounded-xl p-3",
            "bg-theme-bg border border-theme-border",
            "hover:border-amber-200 dark:hover:border-amber-800/50 transition-colors",
          )}
        >
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-amber-100/70 dark:bg-amber-900/20">
            <CalendarClock
              size={18}
              className="text-amber-600 dark:text-amber-400"
            />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="text-sm text-theme-text font-semibold truncate">
              {displayName}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {trigger && <TriggerBadge type={trigger} t={t} />}
              {schedule && (
                <span className="px-2 py-0.5 rounded-md bg-theme-bg-subtle text-theme-text-tertiary text-xs font-mono leading-relaxed">
                  {schedule}
                </span>
              )}
              {typeof enabled === "boolean" && (
                <StatusBadge status={status} enabled={enabled} t={t} />
              )}
              {typeof totalRuns === "number" && totalRuns > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-theme-bg-subtle text-theme-text-tertiary text-xs tabular-nums">
                  {t("scheduledTask.runsCount", { count: totalRuns })}
                </span>
              )}
            </div>
          </div>
          {taskId && (
            <ToolHoverCopyButton
              text={taskId}
              position="args"
              copyButtonClassName="!bg-theme-bg-card/80 !rounded-md !border !border-theme-border"
            />
          )}
        </div>
      )}

      {/* Message prompt */}
      {taskMessage && !isList && (
        <DetailSection
          title={t("chat.message.toolTaskName")}
          icon={<MessageSquare size={12} />}
          defaultExpanded={true}
        >
          <div className="text-sm text-theme-text-secondary whitespace-pre-wrap break-words leading-relaxed">
            {taskMessage}
          </div>
        </DetailSection>
      )}

      {/* Effect description */}
      {effect && !isList && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-sky-50/80 dark:bg-sky-950/30 border border-sky-100 dark:border-sky-900/30">
          <Zap
            size={12}
            className="shrink-0 text-sky-500 dark:text-sky-400 mt-0.5"
          />
          <span className="text-xs text-sky-700 dark:text-sky-300 leading-relaxed">
            {effect}
          </span>
        </div>
      )}

      {/* Result message (confirmation) */}
      {resultMessage && !isList && (
        <div className="flex items-center gap-2 text-xs">
          <CheckCircle2
            size={13}
            className="shrink-0 text-emerald-500 dark:text-emerald-400"
          />
          <span className="text-theme-text-tertiary">{resultMessage}</span>
        </div>
      )}

      {/* List of tasks */}
      {isList && tasks.length > 0 && (
        <DetailSection
          title={t("chat.message.toolScheduledTaskList")}
          icon={<CalendarClock size={12} />}
          defaultExpanded={true}
          badge={
            <span className="text-[10px] text-theme-text-tertiary tabular-nums">
              {tasks.length}
            </span>
          }
        >
          <div className="space-y-1.5">
            {tasks.map((tk, i) => {
              const tkName = String(tk.name || `Task ${i + 1}`);
              const tkTrigger = tk.trigger_type as string | undefined;
              const tkStatus = tk.status as string | undefined;
              const tkEnabled = tk.enabled as boolean | undefined;
              const tkId = tk.id as string | undefined;
              return (
                <div
                  key={tkId || i}
                  className={clsx(
                    "flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors",
                    "bg-theme-bg border border-theme-border",
                    "hover:border-amber-200 dark:hover:border-amber-800/50",
                  )}
                >
                  <CalendarClock
                    size={14}
                    className="shrink-0 text-amber-500 dark:text-amber-400"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-theme-text font-medium truncate">
                      {tkName}
                    </div>
                  </div>
                  {tkTrigger && (
                    <span className="shrink-0 px-1.5 py-0.5 rounded bg-theme-bg-subtle text-[10px] text-theme-text-tertiary">
                      {t(`scheduledTask.${tkTrigger}`)}
                    </span>
                  )}
                  <StatusBadge
                    status={tkStatus}
                    enabled={tkEnabled !== false}
                    t={t}
                  />
                </div>
              );
            })}
          </div>
        </DetailSection>
      )}

      {/* Pure text fallback (no structured data parsed) */}
      {resultMessage && !displayName && !isList && (
        <pre className="group/result relative text-xs text-theme-text-tertiary whitespace-pre-wrap break-words p-3 rounded-lg bg-theme-bg border border-theme-border">
          {resultMessage}
          <ToolHoverCopyButton
            text={resultMessage}
            position="result"
            copyButtonClassName="!bg-theme-bg-card/80 !rounded-md !border !border-theme-border"
          />
        </pre>
      )}
    </div>
  );

  // ── compact (inline) content ────────────────────────────────────────

  const compactContent = canExpand && (
    <ToolInlineDetails>
      {displayName && !isList && (
        <ToolArgsBlock size="compact">
          <CalendarClock
            size={12}
            className="shrink-0 text-amber-500 dark:text-amber-400"
          />
          <span className="truncate text-theme-text font-medium">
            {displayName}
          </span>
          <ToolHoverCopyButton text={displayName} position="argsCompact" />
        </ToolArgsBlock>
      )}

      <div className="flex flex-wrap gap-1">
        {trigger && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100/60 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-[10px] font-medium">
            <Clock size={8} className="opacity-70" />
            {t(`scheduledTask.${trigger}`)}
          </span>
        )}
        {schedule && (
          <span className="px-1.5 py-0.5 rounded bg-theme-bg-subtle text-theme-text-tertiary text-[10px] font-mono">
            {schedule}
          </span>
        )}
        {typeof enabled === "boolean" && (
          <span
            className={clsx(
              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]",
              enabled
                ? "bg-emerald-100/60 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400"
                : "bg-theme-bg-subtle text-theme-text-tertiary",
            )}
          >
            <span
              className={clsx(
                "w-1 h-1 rounded-full",
                enabled ? "bg-emerald-500" : "bg-stone-400",
              )}
            />
            {status
              ? t(`scheduledTask.${status}`)
              : enabled
                ? t("scheduledTask.active")
                : t("scheduledTask.statusOff")}
          </span>
        )}
      </div>

      {/* Compact confirmation */}
      {resultMessage && !isList && (
        <div className="flex items-center gap-1.5 text-[10px]">
          <CheckCircle2
            size={10}
            className="shrink-0 text-emerald-500 dark:text-emerald-400"
          />
          <span className="text-theme-text-tertiary truncate">
            {resultMessage.length > 120
              ? resultMessage.slice(0, 117) + "…"
              : resultMessage}
          </span>
        </div>
      )}

      {/* Compact list */}
      {isList && tasks.length > 0 && (
        <div className="space-y-1">
          {tasks.slice(0, 6).map((tk, i) => {
            const tkName = String(tk.name || `Task ${i + 1}`);
            const tkTrigger = tk.trigger_type as string | undefined;
            return (
              <div
                key={i}
                className="flex items-center gap-2 px-2 py-1 rounded-md bg-theme-bg border border-theme-border hover:border-amber-200 dark:hover:border-amber-800/50 transition-colors"
              >
                <CalendarClock
                  size={10}
                  className="shrink-0 text-amber-500 dark:text-amber-400"
                />
                <span className="text-[10px] text-theme-text truncate flex-1">
                  {tkName}
                </span>
                {tkTrigger && (
                  <span className="shrink-0 text-[9px] text-theme-text-tertiary">
                    {t(`scheduledTask.${tkTrigger}`)}
                  </span>
                )}
              </div>
            );
          })}
          {tasks.length > 6 && (
            <span className="text-[10px] text-theme-text-tertiary pl-2">
              +{tasks.length - 6} more
            </span>
          )}
        </div>
      )}

      {/* Pure text fallback */}
      {resultMessage && !displayName && !isList && (
        <pre className="group/result relative text-xs text-theme-text-tertiary whitespace-pre-wrap break-words overflow-y-auto min-w-0">
          {resultMessage.length > 300
            ? resultMessage.slice(0, 297) + "…"
            : resultMessage}
          <ToolHoverCopyButton text={resultMessage} position="resultCompact" />
        </pre>
      )}
    </ToolInlineDetails>
  );

  return (
    <>
      <CollapsiblePill
        status={pillStatus}
        icon={<CalendarClock size={12} className="shrink-0 opacity-50" />}
        label={`${actionLabel}${labelSuffix ? ` ${labelSuffix}` : ""}`}
        variant="tool"
        expandable={canExpand}
        onPanelOpen={() => {
          if (!canExpand) return;
          openPersistentToolPanel({
            title: actionLabel,
            icon: <CalendarClock size={16} />,
            status: pillStatus,
            subtitle: labelSuffix || undefined,
            children: detailContent,
            footer: durationFooter,
          });
        }}
      >
        {compactContent}
      </CollapsiblePill>
    </>
  );
});

export { ScheduledTaskItem };
