import { useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { CalendarClock, Timer, X } from "lucide-react";
import type { ScheduledTask, ScheduledTaskCreate, TriggerType } from "../../../types/scheduledTask";
import type { AgentInfo } from "../../../types/agent";
import type { AvailableModel } from "../../../contexts/SettingsContext";
import { buildScheduledTaskInputPayload, getAgentOptionsFromScheduledTaskPayload } from "../scheduledTaskPayload";
import { toDateTimeLocalValue } from "./utils";

/** Create/Edit form modal */
export function TaskFormModal({
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
  const taskAgentOptions = getAgentOptionsFromScheduledTaskPayload(
    task?.input_payload,
  );
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
      const nextPayload = buildScheduledTaskInputPayload(payload, {
        modelId,
        modelValue,
        availableModels,
      });
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
