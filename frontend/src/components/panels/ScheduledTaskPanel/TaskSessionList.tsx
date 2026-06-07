import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { PanelHeader } from "../../common/PanelHeader";
import { Pagination } from "../../common/Pagination";
import { scheduledTaskApi } from "../../../services/api/scheduledTask";
import type { TaskSession } from "../../../types/scheduledTask";
import { formatDateTimeShort } from "../../../utils/datetime";

// ── Task Session List (drill-down) ─────────────────

export function TaskSessionList({
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
