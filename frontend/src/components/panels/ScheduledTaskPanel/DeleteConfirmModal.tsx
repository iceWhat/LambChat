import { useTranslation } from "react-i18next";
import { AlertCircle } from "lucide-react";

/** Delete confirmation modal */
export function DeleteConfirmModal({
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
