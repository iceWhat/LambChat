import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Bot, History, Loader2, MessageSquare, User, X } from "lucide-react";
import { Pagination } from "../../common/Pagination";
import { scheduledTaskApi } from "../../../services/api/scheduledTask";
import { sessionApi } from "../../../services/api/session";
import type { ScheduledTask, TaskRun } from "../../../types/scheduledTask";
import { formatDateTimeShort } from "../../../utils/datetime";
import { RunStatusBadge } from "./Badges";
import type { RunConversationMessage } from "./types";
import { extractRunConversationMessages } from "./utils";

/** Run history modal */
export function RunHistoryModal({
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
