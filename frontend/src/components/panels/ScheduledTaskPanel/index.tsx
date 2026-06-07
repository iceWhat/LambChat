import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Clock, History, Pause, Pencil, Play, Plus, RotateCcw, Timer, Trash2 } from "lucide-react";
import { PanelHeader } from "../../common/PanelHeader";
import { Pagination } from "../../common/Pagination";
import { scheduledTaskApi } from "../../../services/api/scheduledTask";
import { agentApi } from "../../../services/api/agent";
import { useAuth } from "../../../hooks/useAuth";
import { useSettingsContext } from "../../../contexts/SettingsContext";
import { Permission } from "../../../types";
import type { ScheduledTask, ScheduledTaskCreate, ScheduledTaskStatus as ScheduledTaskStatusType, ScheduledTaskUpdate } from "../../../types/scheduledTask";
import type { AgentInfo } from "../../../types/agent";
import type { AvailableModel } from "../../../contexts/SettingsContext";
import { formatDateTimeShort } from "../../../utils/datetime";
import { getAgentOptionsFromScheduledTaskPayload } from "../scheduledTaskPayload";
import { notifyScheduledTaskMutation } from "../../../stores/scheduledTaskMutationStore";
import { RunStatusBadge, StatusBadge } from "./Badges";
import { DeleteConfirmModal } from "./DeleteConfirmModal";
import { RunHistoryModal } from "./RunHistoryModal";
import { TaskFormModal } from "./TaskFormModal";
import { TaskSessionList } from "./TaskSessionList";
import { readScheduledTaskDefaults } from "./utils";

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
      if (data.trigger_type !== editingTask.trigger_type)
        updateData.trigger_type = data.trigger_type;
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
      notifyScheduledTaskMutation();
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
      notifyScheduledTaskMutation();
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
      notifyScheduledTaskMutation();
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
      notifyScheduledTaskMutation();
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
      fetchTasks();
      notifyScheduledTaskMutation();
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
    const options = getAgentOptionsFromScheduledTaskPayload(task.input_payload);
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
