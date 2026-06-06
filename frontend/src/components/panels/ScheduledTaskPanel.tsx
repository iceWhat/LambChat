/**
 * 定时任务管理面板 - Scheduled Task CRUD Panel
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Plus,
  Pencil,
  Trash2,
  Clock,
  X,
  AlertCircle,
  Play,
  Pause,
  RotateCcw,
  History,
  Timer,
  CalendarClock,
  MessageSquare,
  Bot,
  User,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { PanelHeader } from "../common/PanelHeader";
import { Pagination } from "../common/Pagination";
import { scheduledTaskApi } from "../../services/api/scheduledTask";
import { sessionApi } from "../../services/api/session";
import { agentApi } from "../../services/api/agent";
import { useAuth } from "../../hooks/useAuth";
import { useSettingsContext } from "../../contexts/SettingsContext";
import { Permission } from "../../types";
import type {
  ScheduledTask,
  ScheduledTaskCreate,
  ScheduledTaskUpdate,
  TaskRun,
  TaskSession,
  TriggerType,
  ScheduledTaskStatus as ScheduledTaskStatusType,
} from "../../types/scheduledTask";
import type { AgentInfo } from "../../types/agent";
import type { AvailableModel } from "../../contexts/SettingsContext";
import type { SSEEventRecord } from "../../types/session";
import { formatDateTimeShort } from "../../utils/datetime";
import {
  closePersistentToolPanel,
  isPersistentToolPanelOpen,
  openPersistentToolPanel,
  updatePersistentToolPanel,
} from "../chat/ChatMessage/items/persistentToolPanelState";
import { notifyScheduledTaskMutation } from "../../stores/scheduledTaskMutationStore";

interface RunConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

const SCHEDULED_TASK_DEFAULTS_KEY = "lambchat_scheduled_task_defaults";

interface ScheduledTaskDefaults {
  agentId?: string;
  modelId?: string;
  modelValue?: string;
}

function readScheduledTaskDefaults(): ScheduledTaskDefaults {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SCHEDULED_TASK_DEFAULTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ScheduledTaskDefaults;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function getAgentOptionsFromPayload(
  payload: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const options = payload?.agent_options;
  return options && typeof options === "object" && !Array.isArray(options)
    ? (options as Record<string, unknown>)
    : {};
}

function withoutModelOptions(
  options: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...options };
  delete next.model_id;
  delete next.model;
  delete next._resolved_model_config;
  delete next._resolved_supports_vision;
  delete next._resolved_fallback_model;
  delete next._resolved_model_profile;
  return next;
}

function extractRunConversationMessages(
  events: SSEEventRecord[],
): RunConversationMessage[] {
  const messages: RunConversationMessage[] = [];

  for (const event of events) {
    if (event.event_type === "user:message") {
      const content = event.data?.content as string | undefined;
      if (content) {
        messages.push({
          role: "user",
          content,
          timestamp: event.timestamp,
        });
      }
      continue;
    }

    if (event.event_type === "assistant:text") {
      const content = event.data?.content as string | undefined;
      if (!content) continue;

      const last = messages[messages.length - 1];
      if (last?.role === "assistant" && last.timestamp === event.timestamp) {
        last.content += content;
      } else {
        messages.push({
          role: "assistant",
          content,
          timestamp: event.timestamp,
        });
      }
    }
  }

  return messages;
}

// ── Sub-components ──────────────────────────────────

/** Status badge for task status display */
function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();

  const styles: Record<string, string> = {
    active:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    paused:
      "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400",
  };

  const dotStyles: Record<string, string> = {
    active: "bg-emerald-500",
    paused: "bg-stone-400",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        styles[status] || styles.paused
      }`}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          dotStyles[status] || dotStyles.paused
        }`}
      />
      {t(`scheduledTask.${status}`)}
    </span>
  );
}

/** Run status badge */
function RunStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    success:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    running:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    pending:
      "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400",
    timeout:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    skipped:
      "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        styles[status] || styles.pending
      }`}
    >
      {status}
    </span>
  );
}

const SESSION_TASK_PANEL_KEY = "session-scheduled-tasks";

function toDateTimeLocalValue(value: string | null | undefined): string {
  const date = value ? new Date(value) : new Date(Date.now() + 5 * 60 * 1000);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formatTaskTrigger(task: ScheduledTask, t: TFunction): string {
  if (task.trigger_type === "interval") {
    const cfg = task.trigger_config as { seconds?: number };
    return `${t("scheduledTask.interval")}: ${cfg.seconds ?? "-"}s`;
  }

  if (task.trigger_type === "date") {
    const cfg = task.trigger_config as { run_date?: string };
    return `${t("scheduledTask.date")}: ${
      cfg.run_date ? formatDateTimeShort(cfg.run_date) : "-"
    }`;
  }

  const cfg = task.trigger_config as {
    hour?: string;
    minute?: string;
    day?: string;
    month?: string;
    day_of_week?: string;
  };
  return `${t("scheduledTask.cron")}: ${[
    cfg.minute ?? "*",
    cfg.hour ?? "*",
    cfg.day ?? "*",
    cfg.month ?? "*",
    cfg.day_of_week ?? "*",
  ].join(" ")}`;
}

function SessionScheduledTaskPanelBody({
  sessionId,
  refreshKey,
  onMutate,
}: {
  sessionId: string;
  refreshKey?: string | number;
  onMutate?: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canWrite = hasPermission(Permission.SCHEDULED_TASK_WRITE);
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await scheduledTaskApi.listBySession(sessionId, 0, 50);
      setTasks(response.items);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("common.loadFailed");
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, t]);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks, refreshKey]);

  const runTaskAction = async (
    task: ScheduledTask,
    action: "pause" | "resume" | "runNow",
  ) => {
    if (!canWrite) {
      toast.error(t("errors.noPermission"));
      return;
    }

    try {
      if (action === "pause") {
        await scheduledTaskApi.pause(task.id);
        toast.success(t("scheduledTask.pausedSuccess"));
      } else if (action === "resume") {
        await scheduledTaskApi.resume(task.id);
        toast.success(t("scheduledTask.resumedSuccess"));
      } else {
        await scheduledTaskApi.runNow(task.id);
        toast.success(t("scheduledTask.triggeredSuccess"));
      }
      await fetchTasks();
      onMutate?.();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("common.operationFailed");
      toast.error(message);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {isLoading && tasks.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-stone-400" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <CalendarClock className="mb-3 h-9 w-9 text-stone-300 dark:text-stone-600" />
          <p className="text-sm text-stone-500 dark:text-stone-400">
            {t(
              "scheduledTask.noConversationTasks",
              "当前会话暂无 agent 创建的定时任务",
            )}
          </p>
        </div>
      ) : (
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg-card)] p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-stone-900 dark:text-stone-100">
                      {task.name}
                    </p>
                    <StatusBadge status={task.status} />
                  </div>
                  {task.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-stone-500 dark:text-stone-400">
                      {task.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-3 space-y-1 text-xs text-stone-500 dark:text-stone-400">
                <div className="flex items-center gap-1.5">
                  <Timer size={12} />
                  <span className="truncate">{formatTaskTrigger(task, t)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Bot size={12} />
                  <span className="truncate">{task.agent_id}</span>
                </div>
                {task.last_run_at ? (
                  <div className="flex items-center gap-1.5">
                    <Clock size={12} />
                    <span>{formatDateTimeShort(task.last_run_at)}</span>
                    {task.last_run_status && (
                      <RunStatusBadge status={task.last_run_status} />
                    )}
                  </div>
                ) : (
                  <div>{t("scheduledTask.neverRun")}</div>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  onClick={() => {
                    closePersistentToolPanel();
                    const params = new URLSearchParams({
                      taskId: task.id,
                      taskName: task.name,
                    });
                    navigate(
                      `/scheduled-tasks?${params.toString()}`,
                    );
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                >
                  <History size={14} />
                  {t("scheduledTask.details", "详情")}
                </button>

                <div className="flex items-center gap-1">
                  {canWrite && task.status === "active" && (
                    <button
                      onClick={() => void runTaskAction(task, "pause")}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-300"
                      title={t("scheduledTask.pause")}
                    >
                      <Pause size={15} />
                    </button>
                  )}
                  {canWrite && task.status === "paused" && (
                    <button
                      onClick={() => void runTaskAction(task, "resume")}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-emerald-500 transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
                      title={t("scheduledTask.resume")}
                    >
                      <Play size={15} />
                    </button>
                  )}
                  {canWrite && (
                    <button
                      onClick={() => void runTaskAction(task, "runNow")}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-blue-50 hover:text-blue-500 dark:hover:bg-blue-900/30 dark:hover:text-blue-400"
                      title={t("scheduledTask.runNow")}
                    >
                      <RotateCcw size={15} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SessionScheduledTasksButton({
  sessionId,
  refreshKey,
}: {
  sessionId: string | null;
  refreshKey?: string | number;
}) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canRead = hasPermission(Permission.SCHEDULED_TASK_READ);
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(async () => {
    if (!sessionId || !canRead) {
      setCount(0);
      return;
    }
    try {
      const response = await scheduledTaskApi.listBySession(sessionId, 0, 1);
      setCount(response.total);
    } catch {
      setCount(0);
    }
  }, [canRead, sessionId]);

  useEffect(() => {
    void fetchCount();
  }, [fetchCount, refreshKey]);

  const panelContent = useMemo(() => {
    if (!sessionId) return null;
    return (
      <SessionScheduledTaskPanelBody
        sessionId={sessionId}
        refreshKey={refreshKey}
        onMutate={fetchCount}
      />
    );
  }, [fetchCount, refreshKey, sessionId]);

  useEffect(() => {
    if (!panelContent || !isPersistentToolPanelOpen(SESSION_TASK_PANEL_KEY)) {
      return;
    }
    updatePersistentToolPanel(
      (panel) => ({
        ...panel,
        children: panelContent,
        subtitle: count > 0 ? `${count}` : undefined,
      }),
      SESSION_TASK_PANEL_KEY,
    );
  }, [count, panelContent]);

  if (!sessionId || !canRead || count === 0) return null;

  const togglePanel = () => {
    if (isPersistentToolPanelOpen(SESSION_TASK_PANEL_KEY)) {
      closePersistentToolPanel();
      return;
    }
    openPersistentToolPanel({
      title: t("scheduledTask.conversationTasks", "会话定时任务"),
      icon: <CalendarClock size={16} />,
      status: "idle",
      subtitle: `${count}`,
      panelKey: SESSION_TASK_PANEL_KEY,
      children: panelContent,
    });
  };

  return (
    <button
      onClick={togglePanel}
      className="absolute right-3 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--theme-border)] bg-[var(--theme-bg-card)]/90 text-stone-500 shadow-sm backdrop-blur transition-colors hover:bg-stone-100 hover:text-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
      title={t("scheduledTask.conversationTasks", "会话定时任务")}
    >
      <CalendarClock size={17} />
      <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-semibold leading-none text-white">
        {count > 99 ? "99+" : count}
      </span>
    </button>
  );
}

/** Delete confirmation modal */
function DeleteConfirmModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/50 transition-opacity"
        onClick={onCancel}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="w-full max-w-md transform overflow-hidden rounded-2xl bg-[var(--theme-bg-card)] p-6 text-left align-middle shadow-xl transition-all"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <AlertCircle className="text-red-600 dark:text-red-400" size={24} />
          </div>
          <h3 className="text-xl font-semibold text-stone-900 dark:text-stone-100 font-serif">
            {t("scheduledTask.deleteConfirm")}
          </h3>
          <div className="mt-2">
            <p className="text-sm text-stone-500 dark:text-stone-400">
              {t("scheduledTask.deleteWarning")}
            </p>
          </div>
          <div className="mt-6 flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 rounded-xl border border-[var(--glass-border)] bg-[var(--theme-bg-card)] px-4 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 dark:text-stone-300 dark:hover:bg-stone-700"
            >
              {t("scheduledTask.cancel")}
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
            >
              {t("scheduledTask.delete")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/** Create/Edit form modal */
function TaskFormModal({
  task,
  agents,
  availableModels,
  defaultAgentId,
  defaultModelId,
  defaultModelValue,
  onSave,
  onClose,
}: {
  task: ScheduledTask | null;
  agents: AgentInfo[];
  availableModels: AvailableModel[] | null;
  defaultAgentId?: string;
  defaultModelId?: string;
  defaultModelValue?: string;
  onSave: (data: ScheduledTaskCreate) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const isEdit = !!task;
  const taskAgentOptions = getAgentOptionsFromPayload(task?.input_payload);
  const initialModelId =
    (typeof taskAgentOptions.model_id === "string"
      ? taskAgentOptions.model_id
      : "") ||
    defaultModelId ||
    "";
  const initialModelValue =
    (typeof taskAgentOptions.model === "string" ? taskAgentOptions.model : "") ||
    defaultModelValue ||
    "";

  const [name, setName] = useState(task?.name ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [agentId, setAgentId] = useState(task?.agent_id ?? defaultAgentId ?? "");
  const [modelId, setModelId] = useState(initialModelId);
  const [modelValue, setModelValue] = useState(initialModelValue);
  const [triggerType, setTriggerType] = useState<TriggerType>(
    task?.trigger_type ?? "interval",
  );
  const [intervalSeconds, setIntervalSeconds] = useState(
    task?.trigger_type === "interval"
      ? String((task?.trigger_config as { seconds?: number })?.seconds ?? 300)
      : "300",
  );
  const [runDate, setRunDate] = useState(
    task?.trigger_type === "date"
      ? toDateTimeLocalValue((task?.trigger_config as { run_date?: string })?.run_date)
      : toDateTimeLocalValue(null),
  );
  const [cronHour, setCronHour] = useState(
    task?.trigger_type === "cron"
      ? String((task?.trigger_config as { hour?: string })?.hour ?? "0")
      : "0",
  );
  const [cronMinute, setCronMinute] = useState(
    task?.trigger_type === "cron"
      ? String((task?.trigger_config as { minute?: string })?.minute ?? "0")
      : "0",
  );
  const [cronSecond, setCronSecond] = useState(
    task?.trigger_type === "cron"
      ? String((task?.trigger_config as { second?: string })?.second ?? "0")
      : "0",
  );
  const [cronDay, setCronDay] = useState(
    task?.trigger_type === "cron"
      ? String((task?.trigger_config as { day?: string })?.day ?? "")
      : "",
  );
  const [cronMonth, setCronMonth] = useState(
    task?.trigger_type === "cron"
      ? String((task?.trigger_config as { month?: string })?.month ?? "")
      : "",
  );
  const [cronDayOfWeek, setCronDayOfWeek] = useState(
    task?.trigger_type === "cron"
      ? String(
          (task?.trigger_config as { day_of_week?: string })?.day_of_week ?? "",
        )
      : "",
  );
  const [inputPayload, setInputPayload] = useState(
    task ? JSON.stringify(task.input_payload ?? {}, null, 2) : "{}",
  );
  const [enabled, setEnabled] = useState(task?.enabled ?? true);
  const [runOnStart, setRunOnStart] = useState(task?.run_on_start ?? false);
  const [maxRetries, setMaxRetries] = useState(
    String(task?.max_retries ?? 0),
  );
  const [timeoutSeconds, setTimeoutSeconds] = useState(
    String(task?.timeout_seconds ?? 600),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error(t("scheduledTask.nameRequired"));
      return;
    }
    if (!agentId) {
      toast.error(t("scheduledTask.agentRequired"));
      return;
    }

    // Validate JSON
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(inputPayload || "{}");
    } catch {
      setJsonError(t("scheduledTask.invalidJson"));
      return;
    }
    setJsonError(null);

    // Build trigger config
    let triggerConfig: Record<string, unknown>;
    if (triggerType === "interval") {
      triggerConfig = { seconds: Math.max(1, parseInt(intervalSeconds) || 300) };
    } else if (triggerType === "date") {
      if (!runDate) {
        toast.error(t("scheduledTask.runDateRequired"));
        return;
      }
      const date = new Date(runDate);
      if (Number.isNaN(date.getTime())) {
        toast.error(t("scheduledTask.runDateRequired"));
        return;
      }
      triggerConfig = { run_date: date.toISOString() };
    } else {
      triggerConfig = {
        hour: cronHour || "0",
        minute: cronMinute || "0",
        second: cronSecond || "0",
        ...(cronDay ? { day: cronDay } : {}),
        ...(cronMonth ? { month: cronMonth } : {}),
        ...(cronDayOfWeek ? { day_of_week: cronDayOfWeek } : {}),
      };
    }

    setIsSaving(true);
    try {
      const selectedModel = availableModels?.find((m) => m.id === modelId);
      const nextAgentOptions = {
        ...withoutModelOptions(getAgentOptionsFromPayload(payload)),
        ...(modelId ? { model_id: modelId } : {}),
        ...(selectedModel?.value || modelValue
          ? { model: selectedModel?.value || modelValue }
          : {}),
      };
      const nextPayload = {
        ...payload,
        ...(Object.keys(nextAgentOptions).length > 0
          ? { agent_options: nextAgentOptions }
          : {}),
      };
      await onSave({
        name: name.trim(),
        agent_id: agentId,
        trigger_type: triggerType,
        trigger_config: triggerConfig,
        input_payload: nextPayload,
        description: description.trim() || null,
        enabled,
        run_on_start: triggerType === "date" ? false : runOnStart,
        max_retries: Math.max(0, parseInt(maxRetries) || 0),
        timeout_seconds: Math.max(10, parseInt(timeoutSeconds) || 600),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass =
    "w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 transition-all focus:border-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-500/20 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100";

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/50 transition-opacity"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="w-full max-w-2xl max-h-[90dvh] transform overflow-hidden rounded-2xl bg-[var(--theme-bg-card)] text-left align-middle shadow-xl transition-all flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--glass-border)] p-6 pb-4">
            <h3 className="text-xl font-semibold text-stone-900 dark:text-stone-100 font-serif">
              {isEdit ? t("scheduledTask.edit") : t("scheduledTask.create")}
            </h3>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-300"
            >
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                {t("scheduledTask.name")} *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                placeholder={t("scheduledTask.namePlaceholder")}
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                {t("scheduledTask.description")}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className={`${inputClass} resize-y`}
                placeholder={t("scheduledTask.descriptionPlaceholder")}
              />
            </div>

            {/* Agent selector */}
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                {t("scheduledTask.agent")} *
              </label>
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className={inputClass}
              >
                <option value="">{t("scheduledTask.agentPlaceholder")}</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Model selector */}
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                {t("scheduledTask.model")}
              </label>
              <select
                value={modelId}
                onChange={(e) => {
                  const nextModel = availableModels?.find(
                    (model) => model.id === e.target.value,
                  );
                  setModelId(e.target.value);
                  setModelValue(nextModel?.value || "");
                }}
                className={inputClass}
                disabled={!availableModels || availableModels.length === 0}
              >
                <option value="">{t("scheduledTask.modelPlaceholder")}</option>
                {(availableModels || []).map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label || model.value}
                  </option>
                ))}
              </select>
            </div>

            {/* Trigger type */}
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                {t("scheduledTask.triggerType")}
              </label>
              <div className="flex gap-2">
                {(["date", "interval", "cron"] as const).map((tt) => (
                  <button
                    key={tt}
                    type="button"
                    onClick={() => setTriggerType(tt)}
                    className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                      triggerType === tt
                        ? "border-stone-500 bg-stone-100 text-stone-900 dark:border-stone-400 dark:bg-stone-800 dark:text-stone-100"
                        : "border-stone-200 bg-stone-50 text-stone-500 hover:border-stone-300 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400 dark:hover:border-stone-600"
                    }`}
                  >
                    {tt === "interval" ? (
                      <Timer size={16} />
                    ) : (
                      <CalendarClock size={16} />
                    )}
                    {t(`scheduledTask.${tt}`)}
                  </button>
                ))}
              </div>
            </div>

            {/* Trigger config */}
            {triggerType === "interval" ? (
              <div>
                <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                  {t("scheduledTask.intervalSeconds")} *
                </label>
                <input
                  type="number"
                  min={1}
                  value={intervalSeconds}
                  onChange={(e) => setIntervalSeconds(e.target.value)}
                  className={inputClass}
                />
              </div>
            ) : triggerType === "date" ? (
              <div>
                <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                  {t("scheduledTask.runDate")} *
                </label>
                <input
                  type="datetime-local"
                  value={runDate}
                  onChange={(e) => setRunDate(e.target.value)}
                  className={inputClass}
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {(
                  [
                    { key: "cronHour", label: t("scheduledTask.cronHour"), value: cronHour, set: setCronHour },
                    { key: "cronMinute", label: t("scheduledTask.cronMinute"), value: cronMinute, set: setCronMinute },
                    { key: "cronSecond", label: t("scheduledTask.cronSecond"), value: cronSecond, set: setCronSecond },
                    { key: "cronDay", label: t("scheduledTask.cronDay"), value: cronDay, set: setCronDay },
                    { key: "cronMonth", label: t("scheduledTask.cronMonth"), value: cronMonth, set: setCronMonth },
                    { key: "cronDayOfWeek", label: t("scheduledTask.cronDayOfWeek"), value: cronDayOfWeek, set: setCronDayOfWeek },
                  ] as const
                ).map(({ key, label, value, set }) => (
                  <div key={key}>
                    <label className="block text-xs text-stone-500 dark:text-stone-400 mb-1">
                      {label}
                    </label>
                    <input
                      type="text"
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      className={inputClass}
                      placeholder="*"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Input payload */}
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                {t("scheduledTask.inputPayload")}
              </label>
              <textarea
                value={inputPayload}
                onChange={(e) => {
                  setInputPayload(e.target.value);
                  setJsonError(null);
                }}
                rows={4}
                className={`${inputClass} resize-y font-mono text-xs`}
                placeholder="{}"
              />
              {jsonError && (
                <p className="mt-1 text-xs text-red-500">{jsonError}</p>
              )}
            </div>

            {/* Toggles */}
            <div className="space-y-3">
              {/* Enabled toggle */}
              <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-700 dark:bg-stone-900">
                <p className="text-sm font-medium text-stone-700 dark:text-stone-300">
                  {t("scheduledTask.enabled")}
                </p>
                <button
                  type="button"
                  onClick={() => setEnabled(!enabled)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-stone-500/20 ${
                    enabled
                      ? "bg-emerald-500"
                      : "bg-stone-300 dark:bg-stone-600"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                      enabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {triggerType !== "date" && (
                <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-700 dark:bg-stone-900">
                  <p className="text-sm font-medium text-stone-700 dark:text-stone-300">
                    {t("scheduledTask.runOnStart")}
                  </p>
                  <button
                    type="button"
                    onClick={() => setRunOnStart(!runOnStart)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-stone-500/20 ${
                      runOnStart
                        ? "bg-emerald-500"
                        : "bg-stone-300 dark:bg-stone-600"
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                        runOnStart ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              )}
            </div>

            {/* Number inputs */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                  {t("scheduledTask.maxRetries")}
                </label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={maxRetries}
                  onChange={(e) => setMaxRetries(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                  {t("scheduledTask.timeoutSeconds")}
                </label>
                <input
                  type="number"
                  min={10}
                  max={3600}
                  value={timeoutSeconds}
                  onChange={(e) => setTimeoutSeconds(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-3 border-t border-[var(--glass-border)] p-6 pt-4">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-[var(--glass-border)] bg-[var(--theme-bg-card)] px-4 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 dark:text-stone-300 dark:hover:bg-stone-700"
            >
              {t("scheduledTask.cancel")}
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
            >
              {isSaving ? (
                <span className="inline-flex items-center gap-2">
                  <svg
                    className="h-4 w-4 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  {t("common.saving") || "Saving..."}
                </span>
              ) : (
                t("scheduledTask.save")
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/** Run history modal */
function RunHistoryModal({
  task,
  onClose,
}: {
  task: ScheduledTask;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [runs, setRuns] = useState<TaskRun[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRun, setSelectedRun] = useState<TaskRun | null>(null);
  const [messages, setMessages] = useState<RunConversationMessage[]>([]);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const limit = 10;

  const fetchRuns = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await scheduledTaskApi.getRuns(task.id, limit, offset);
      setRuns(response.items);
      setTotal(response.total);
      setSelectedRun((current) => {
        if (current && response.items.some((run) => run.id === current.id)) {
          return current;
        }
        return (
          response.items.find((run) => run.session_id) ??
          response.items[0] ??
          null
        );
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("common.loadFailed");
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [task.id, offset, t]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  useEffect(() => {
    if (!selectedRun?.session_id) {
      setMessages([]);
      return;
    }

    let cancelled = false;
    setIsLoadingConversation(true);
    sessionApi
      .getEvents(selectedRun.session_id, { run_id: selectedRun.id })
      .then((response) => {
        if (!cancelled) {
          setMessages(extractRunConversationMessages(response.events));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setMessages([]);
          const message =
            error instanceof Error ? error.message : t("common.loadFailed");
          toast.error(message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingConversation(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRun, t]);

  const formatDuration = (ms: number | null): string => {
    if (ms === null) return "-";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/50 transition-opacity"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="w-full max-w-5xl max-h-[86dvh] transform overflow-hidden rounded-2xl bg-[var(--theme-bg-card)] text-left align-middle shadow-xl transition-all flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--glass-border)] p-6 pb-4">
            <h3 className="text-xl font-semibold text-stone-900 dark:text-stone-100 font-serif">
              {t("scheduledTask.runHistory")} — {task.name}
            </h3>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-300"
            >
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[360px_minmax(0,1fr)]">
            <div className="min-h-0 overflow-y-auto border-b border-[var(--glass-border)] p-4 lg:border-b-0 lg:border-r">
              {isLoading && runs.length === 0 ? (
                <div className="flex h-40 items-center justify-center">
                  <div className="relative h-8 w-8">
                    <div className="absolute inset-0 rounded-full border-2 border-stone-200 dark:border-stone-700" />
                    <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-stone-600 dark:border-t-stone-300 animate-spin will-change-transform" />
                  </div>
                </div>
              ) : runs.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center text-center">
                  <History
                    size={32}
                    className="mb-3 text-stone-400 dark:text-stone-500"
                  />
                  <p className="text-sm text-stone-500 dark:text-stone-400">
                    {t("scheduledTask.noRuns")}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {runs.map((run) => (
                    <button
                      key={run.id}
                      onClick={() => setSelectedRun(run)}
                      className={`glass-card w-full rounded-xl p-4 text-left transition-colors ${
                        selectedRun?.id === run.id
                          ? "ring-2 ring-stone-900/15 dark:ring-stone-100/20"
                          : "hover:bg-stone-50 dark:hover:bg-stone-800/60"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <RunStatusBadge status={run.status} />
                          <span className="text-xs text-stone-500 dark:text-stone-400">
                            {run.trigger_type}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-stone-400 dark:text-stone-500">
                          <span>
                            {t("scheduledTask.duration")}:{" "}
                            {formatDuration(run.duration_ms)}
                          </span>
                          {run.started_at && (
                            <span>{formatDateTimeShort(run.started_at)}</span>
                          )}
                        </div>
                      </div>
                      {run.error_message && (
                        <p className="mt-2 text-xs text-red-500 dark:text-red-400 break-all">
                          {run.error_message}
                        </p>
                      )}
                      {!run.session_id && (
                        <p className="mt-2 text-xs text-stone-400 dark:text-stone-500">
                          {t("scheduledTask.noConversation")}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="min-h-0 overflow-y-auto p-5">
              {!selectedRun ? (
                <div className="flex h-full min-h-60 flex-col items-center justify-center text-center text-sm text-stone-400 dark:text-stone-500">
                  <MessageSquare size={32} className="mb-3" />
                  {t("scheduledTask.noRuns")}
                </div>
              ) : !selectedRun.session_id ? (
                <div className="flex h-full min-h-60 flex-col items-center justify-center text-center text-sm text-stone-400 dark:text-stone-500">
                  <MessageSquare size={32} className="mb-3" />
                  {t("scheduledTask.noConversation")}
                </div>
              ) : isLoadingConversation ? (
                <div className="flex h-full min-h-60 items-center justify-center">
                  <Loader2 size={22} className="animate-spin text-stone-400" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex h-full min-h-60 flex-col items-center justify-center text-center text-sm text-stone-400 dark:text-stone-500">
                  <MessageSquare size={32} className="mb-3" />
                  {t("scheduledTask.noConversation")}
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message, index) => (
                    <div
                      key={`${message.timestamp}-${index}`}
                      className="flex gap-3"
                    >
                      <div
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                          message.role === "user"
                            ? "bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200"
                            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                        }`}
                      >
                        {message.role === "user" ? (
                          <User size={16} />
                        ) : (
                          <Bot size={16} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2 text-xs text-stone-400 dark:text-stone-500">
                          <span>
                            {message.role === "user"
                              ? t("common.user")
                              : t("chat.message.assistant")}
                          </span>
                          {message.timestamp && (
                            <span>
                              {formatDateTimeShort(message.timestamp)}
                            </span>
                          )}
                        </div>
                        <div className="whitespace-pre-wrap break-words rounded-lg bg-stone-50 px-3 py-2 text-sm leading-6 text-stone-700 dark:bg-stone-800/70 dark:text-stone-200">
                          {message.content}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Pagination */}
          {total > limit && (
            <div className="border-t border-[var(--glass-border)] px-6 py-4">
              <Pagination
                page={Math.floor(offset / limit) + 1}
                pageSize={limit}
                total={total}
                onChange={(page) => setOffset((page - 1) * limit)}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Task Session List (drill-down) ─────────────────

function TaskSessionList({
  taskId,
  taskName,
  onBack,
}: {
  taskId: string;
  taskName: string;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<TaskSession[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const limit = 20;

  const fetchSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await scheduledTaskApi.getSessions(taskId, skip, limit);
      setSessions(response.items);
      setTotal(response.total);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("common.loadFailed");
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [taskId, skip, t]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleSessionClick = (sessionId: string) => {
    navigate(`/chat/${sessionId}`);
  };

  return (
    <div className="flex h-full flex-col min-h-0">
      {/* Header with back button */}
      <PanelHeader
        title={taskName}
        subtitle={t("scheduledTask.sessionsSubtitle")}
        icon={
          <MessageSquare
            size={20}
            className="text-stone-600 dark:text-stone-400"
          />
        }
        actions={
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
          >
            <ArrowLeft size={16} />
            {t("scheduledTask.backToTasks")}
          </button>
        }
      />

      {/* Session List */}
      <div className="flex-1 overflow-y-auto py-2 sm:py-4 px-4 sm:p-6">
        {isLoading && sessions.length === 0 ? (
          <div className="flex h-40 items-center justify-center">
            <div className="relative h-8 w-8">
              <div className="absolute inset-0 rounded-full border-2 border-stone-200 dark:border-stone-700" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-stone-600 dark:border-t-stone-300 animate-spin will-change-transform" />
            </div>
          </div>
        ) : !isLoading && sessions.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-stone-100 dark:bg-stone-800">
              <MessageSquare
                size={32}
                className="text-stone-400 dark:text-stone-500"
              />
            </div>
            <p className="text-lg font-medium text-stone-700 dark:text-stone-300">
              {t("scheduledTask.noSessions")}
            </p>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
              {t("scheduledTask.noSessionsDesc")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => handleSessionClick(session.id)}
                className="glass-card w-full rounded-xl p-4 sm:p-5 text-left hover:border-stone-300 dark:hover:border-stone-600 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-stone-900 dark:text-stone-100 truncate">
                      {session.name ||
                        t("scheduledTask.untitledSession")}
                    </p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-stone-500 dark:text-stone-400">
                      {session.created_at && (
                        <span>
                          {formatDateTimeShort(session.created_at)}
                        </span>
                      )}
                      {session.updated_at &&
                        session.updated_at !== session.created_at && (
                          <span>
                            {t("scheduledTask.updated")}:{" "}
                            {formatDateTimeShort(session.updated_at)}
                          </span>
                        )}
                    </div>
                  </div>
                  <MessageSquare
                    size={16}
                    className="text-stone-400 flex-shrink-0"
                  />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > limit && (
        <div className="glass-divider bg-transparent px-4 py-4 sm:px-6">
          <Pagination
            page={Math.floor(skip / limit) + 1}
            pageSize={limit}
            total={total}
            onChange={(page) => setSkip((page - 1) * limit)}
          />
        </div>
      )}
    </div>
  );
}

// ── Main Panel ──────────────────────────────────────

export function ScheduledTaskPanel({
  agents: providedAgents,
  currentAgent,
  availableModels: providedAvailableModels,
  currentModelId,
  currentModelValue,
}: {
  agents?: AgentInfo[];
  currentAgent?: string;
  availableModels?: AvailableModel[] | null;
  currentModelId?: string;
  currentModelValue?: string;
} = {}) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const { availableModels: settingsAvailableModels } = useSettingsContext();
  const canWrite = hasPermission(Permission.SCHEDULED_TASK_WRITE);
  const canDelete = hasPermission(Permission.SCHEDULED_TASK_DELETE);
  const [searchParams, setSearchParams] = useSearchParams();
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [limit] = useState(20);
  const [statusFilter, setStatusFilter] = useState<
    ScheduledTaskStatusType | undefined
  >(undefined);
  const [deleteTarget, setDeleteTarget] = useState<ScheduledTask | null>(null);
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [runHistoryTask, setRunHistoryTask] = useState<ScheduledTask | null>(
    null,
  );
  const [agents, setAgents] = useState<AgentInfo[]>(providedAgents || []);
  const [apiDefaultAgentId, setApiDefaultAgentId] = useState("");
  const defaults = readScheduledTaskDefaults();
  const effectiveAvailableModels =
    providedAvailableModels ?? settingsAvailableModels ?? null;
  const fallbackDefaultModel = effectiveAvailableModels?.[0] || null;
  const effectiveDefaultAgentId =
    currentAgent || defaults.agentId || apiDefaultAgentId || "";
  const effectiveDefaultModelId =
    currentModelId || defaults.modelId || fallbackDefaultModel?.id || "";
  const effectiveDefaultModelValue =
    currentModelValue || defaults.modelValue || fallbackDefaultModel?.value || "";
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskName, setSelectedTaskName] = useState<string>("");
  const taskIdFromQuery = searchParams.get("taskId");
  const taskNameFromQuery = searchParams.get("taskName");

  // Fetch agents once for the form selector
  useEffect(() => {
    if (providedAgents) {
      setAgents(providedAgents);
      return;
    }
    agentApi
      .list()
      .then((res) => {
        setAgents(res.agents);
        setApiDefaultAgentId(res.default_agent || "");
      })
      .catch(() => {});
  }, [providedAgents]);

  // Fetch tasks
  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await scheduledTaskApi.list(
        skip,
        limit,
        statusFilter,
      );
      setTasks(response.items);
      setTotal(response.total);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("common.loadFailed");
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [skip, limit, statusFilter, t]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    if (!taskIdFromQuery) return;

    const taskName =
      taskNameFromQuery ||
      tasks.find((task) => task.id === taskIdFromQuery)?.name ||
      t("scheduledTask.title");

    setSelectedTaskId(taskIdFromQuery);
    setSelectedTaskName(taskName);
  }, [taskIdFromQuery, taskNameFromQuery, tasks, t]);

  // Reset to page 1 when filter changes
  useEffect(() => {
    setSkip(0);
  }, [statusFilter]);

  const handleCreate = async (data: ScheduledTaskCreate) => {
    if (!canWrite) {
      toast.error(t("errors.noPermission"));
      return;
    }
    try {
      await scheduledTaskApi.create(data);
      toast.success(t("scheduledTask.createdSuccess"));
      setIsCreating(false);
      fetchTasks();
      notifyScheduledTaskMutation();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("common.saveFailed");
      toast.error(message);
    }
  };

  const handleUpdate = async (data: ScheduledTaskCreate) => {
    if (!editingTask) return;
    if (!canWrite) {
      toast.error(t("errors.noPermission"));
      return;
    }
    try {
      const updateData: ScheduledTaskUpdate = {};
      if (data.name !== editingTask.name) updateData.name = data.name;
      if (data.agent_id !== editingTask.agent_id) updateData.agent_id = data.agent_id;
      if (JSON.stringify(data.trigger_config) !== JSON.stringify(editingTask.trigger_config))
        updateData.trigger_config = data.trigger_config;
      if (JSON.stringify(data.input_payload) !== JSON.stringify(editingTask.input_payload))
        updateData.input_payload = data.input_payload;
      if (data.description !== editingTask.description)
        updateData.description = data.description;
      if (data.enabled !== editingTask.enabled) updateData.enabled = data.enabled;
      if (data.run_on_start !== editingTask.run_on_start)
        updateData.run_on_start = data.run_on_start;
      if (data.max_retries !== editingTask.max_retries)
        updateData.max_retries = data.max_retries;
      if (data.timeout_seconds !== editingTask.timeout_seconds)
        updateData.timeout_seconds = data.timeout_seconds;

      await scheduledTaskApi.update(editingTask.id, updateData);
      toast.success(t("scheduledTask.updatedSuccess"));
      setEditingTask(null);
      fetchTasks();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("common.saveFailed");
      toast.error(message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (!canDelete) {
      toast.error(t("errors.noPermission"));
      return;
    }
    try {
      await scheduledTaskApi.delete(deleteTarget.id);
      toast.success(t("scheduledTask.deletedSuccess"));
      setDeleteTarget(null);
      fetchTasks();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("common.deleteFailed");
      toast.error(message);
    }
  };

  const handlePause = async (task: ScheduledTask) => {
    if (!canWrite) {
      toast.error(t("errors.noPermission"));
      return;
    }
    try {
      await scheduledTaskApi.pause(task.id);
      toast.success(t("scheduledTask.pausedSuccess"));
      fetchTasks();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("common.operationFailed");
      toast.error(message);
    }
  };

  const handleResume = async (task: ScheduledTask) => {
    if (!canWrite) {
      toast.error(t("errors.noPermission"));
      return;
    }
    try {
      await scheduledTaskApi.resume(task.id);
      toast.success(t("scheduledTask.resumedSuccess"));
      fetchTasks();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("common.operationFailed");
      toast.error(message);
    }
  };

  const handleRunNow = async (task: ScheduledTask) => {
    if (!canWrite) {
      toast.error(t("errors.noPermission"));
      return;
    }
    try {
      await scheduledTaskApi.runNow(task.id);
      toast.success(t("scheduledTask.triggeredSuccess"));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("common.operationFailed");
      toast.error(message);
    }
  };

  /** Format trigger config for display */
  const formatTriggerInfo = (task: ScheduledTask): string => {
    if (task.trigger_type === "interval") {
      const cfg = task.trigger_config as { seconds?: number };
      return `${t("scheduledTask.interval")}: ${cfg.seconds}s`;
    }
    if (task.trigger_type === "date") {
      const cfg = task.trigger_config as { run_date?: string };
      return `${t("scheduledTask.date")}: ${
        cfg.run_date ? formatDateTimeShort(cfg.run_date) : "-"
      }`;
    }
    const cfg = task.trigger_config as {
      hour?: string;
      minute?: string;
      second?: string;
      day?: string;
      month?: string;
      day_of_week?: string;
    };
    const parts = [
      cfg.minute ?? "*",
      cfg.hour ?? "*",
      cfg.day ?? "*",
      cfg.month ?? "*",
      cfg.day_of_week ?? "*",
    ];
    return `${t("scheduledTask.cron")}: ${parts.join(" ")}`;
  };

  const formatTaskModel = (task: ScheduledTask): string | null => {
    const options = getAgentOptionsFromPayload(task.input_payload);
    const modelId = typeof options.model_id === "string" ? options.model_id : "";
    const modelValue = typeof options.model === "string" ? options.model : "";
    if (!modelId && !modelValue) return null;
    const model = effectiveAvailableModels?.find(
      (item) => item.id === modelId || item.value === modelValue,
    );
    return model?.label || modelValue || modelId;
  };

  return (
    <div className="glass-shell flex h-full flex-col min-h-0">
      {selectedTaskId ? (
        <TaskSessionList
          taskId={selectedTaskId}
          taskName={selectedTaskName}
          onBack={() => {
            setSelectedTaskId(null);
            setSelectedTaskName("");
            setSearchParams({});
          }}
        />
      ) : (
        <>
          {/* Header */}
          <PanelHeader
        title={t("scheduledTask.title")}
        icon={
          <Clock size={20} className="text-stone-600 dark:text-stone-400" />
        }
        actions={
          <div className="flex items-center gap-3">
            {/* Status filter */}
            <select
              value={statusFilter ?? ""}
              onChange={(e) =>
                setStatusFilter(
                  (e.target.value || undefined) as
                    | ScheduledTaskStatusType
                    | undefined,
                )
              }
              className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700 transition-all focus:border-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-500/20 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
            >
              <option value="">{t("scheduledTask.allStatuses")}</option>
              <option value="active">{t("scheduledTask.active")}</option>
              <option value="paused">{t("scheduledTask.paused")}</option>
            </select>

            {/* Create button */}
            {canWrite && (
              <button
                onClick={() => setIsCreating(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
              >
                <Plus size={16} />
                {t("scheduledTask.create")}
              </button>
            )}
          </div>
        }
      />

      {/* Task List */}
      <div className="flex-1 overflow-y-auto py-2 sm:py-4 px-4 sm:p-6">
        {isLoading && tasks.length === 0 ? (
          <div className="flex h-40 items-center justify-center">
            <div className="relative h-8 w-8">
              <div className="absolute inset-0 rounded-full border-2 border-stone-200 dark:border-stone-700" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-stone-600 dark:border-t-stone-300 animate-spin will-change-transform" />
            </div>
          </div>
        ) : !isLoading && tasks.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-stone-100 dark:bg-stone-800">
              <Clock
                size={32}
                className="text-stone-400 dark:text-stone-500"
              />
            </div>
            <p className="text-lg font-medium text-stone-700 dark:text-stone-300">
              {t("scheduledTask.noTasks")}
            </p>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
              {t("scheduledTask.noTasksDesc")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => {
              const agentName =
                agents.find((a) => a.id === task.agent_id)?.name ??
                task.agent_id;
              const modelName = formatTaskModel(task);

              return (
                <div
                  key={task.id}
                  className="glass-card rounded-xl p-4 sm:p-5 hover:border-stone-300 dark:hover:border-stone-600 transition-colors cursor-pointer"
                  onClick={() => {
                    setSelectedTaskId(task.id);
                    setSelectedTaskName(task.name);
                  }}
                >
                  <div className="flex items-start justify-between gap-3 sm:gap-4">
                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 sm:gap-3 mb-2">
                        <p className="font-medium text-stone-900 dark:text-stone-100 break-words line-clamp-1">
                          {task.name}
                        </p>
                        <StatusBadge status={task.status} />
                      </div>

                      {task.description && (
                        <p className="text-sm text-stone-500 dark:text-stone-400 mb-2 line-clamp-2">
                          {task.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
                        <span className="inline-flex items-center gap-1">
                          <Timer size={12} />
                          {formatTriggerInfo(task)}
                        </span>
                        <span>{agentName}</span>
                        {modelName && <span>{modelName}</span>}
                        {task.total_runs > 0 && (
                          <span>
                            {t("scheduledTask.totalRuns")}: {task.total_runs}
                          </span>
                        )}
                      </div>

                      {task.last_run_at && (
                        <div className="mt-2 flex items-center gap-2 text-xs text-stone-400 dark:text-stone-500">
                          <span>{t("scheduledTask.lastRun")}:</span>
                          <span>
                            {formatDateTimeShort(task.last_run_at)}
                          </span>
                          {task.last_run_status && (
                            <RunStatusBadge status={task.last_run_status} />
                          )}
                        </div>
                      )}

                      {!task.last_run_at && (
                        <p className="mt-2 text-xs text-stone-400 dark:text-stone-500">
                          {t("scheduledTask.neverRun")}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div
                      className="flex items-center gap-1 flex-shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {canWrite && task.status === "active" && (
                        <button
                          onClick={() => handlePause(task)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-400 transition-all hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-300"
                          title={t("scheduledTask.pause")}
                        >
                          <Pause size={16} />
                        </button>
                      )}
                      {canWrite && task.status === "paused" && (
                        <button
                          onClick={() => handleResume(task)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-emerald-500 transition-all hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
                          title={t("scheduledTask.resume")}
                        >
                          <Play size={16} />
                        </button>
                      )}
                      {canWrite && (
                        <button
                          onClick={() => handleRunNow(task)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-400 transition-all hover:bg-blue-50 hover:text-blue-500 dark:hover:bg-blue-900/30 dark:hover:text-blue-400"
                          title={t("scheduledTask.runNow")}
                        >
                          <RotateCcw size={16} />
                        </button>
                      )}
                      <button
                        onClick={() => setRunHistoryTask(task)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-400 transition-all hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-300"
                        title={t("scheduledTask.runHistory")}
                      >
                        <History size={16} />
                      </button>
                      {canWrite && (
                        <button
                          onClick={() => setEditingTask(task)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-400 transition-all hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-300"
                          title={t("scheduledTask.edit")}
                        >
                          <Pencil size={16} />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => setDeleteTarget(task)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-400 transition-all hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                          title={t("scheduledTask.delete")}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > limit && (
        <div className="glass-divider bg-transparent px-4 py-4 sm:px-6">
          <Pagination
            page={Math.floor(skip / limit) + 1}
            pageSize={limit}
            total={total}
            onChange={(page) => setSkip((page - 1) * limit)}
          />
        </div>
      )}

      {/* Create Modal */}
      {isCreating && canWrite && (
        <TaskFormModal
          task={null}
          agents={agents}
          availableModels={effectiveAvailableModels}
          defaultAgentId={effectiveDefaultAgentId}
          defaultModelId={effectiveDefaultModelId}
          defaultModelValue={effectiveDefaultModelValue}
          onSave={handleCreate}
          onClose={() => setIsCreating(false)}
        />
      )}

      {/* Edit Modal */}
      {editingTask && canWrite && (
        <TaskFormModal
          task={editingTask}
          agents={agents}
          availableModels={effectiveAvailableModels}
          defaultAgentId={effectiveDefaultAgentId}
          defaultModelId={effectiveDefaultModelId}
          defaultModelValue={effectiveDefaultModelValue}
          onSave={handleUpdate}
          onClose={() => setEditingTask(null)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && canDelete && (
        <DeleteConfirmModal
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Run History Modal */}
      {runHistoryTask && (
        <RunHistoryModal
          task={runHistoryTask}
          onClose={() => setRunHistoryTask(null)}
        />
      )}
        </>
      )}
    </div>
  );
}
