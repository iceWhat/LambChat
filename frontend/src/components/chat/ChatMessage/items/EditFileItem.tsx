import { memo } from "react";
import { Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CollapsiblePill } from "../../../common";
import { DeferredCodeMirrorViewer } from "../../../common/DeferredCodeMirrorViewer";
import { extractText } from "./toolUtils";
import { openPersistentToolPanel } from "./persistentToolPanelState";
import { ToolArgsBlock } from "./ToolArgsBlock";
import { ToolHoverCopyButton } from "./ToolHoverCopyButton";
import { ToolInlineDetails } from "./ToolInlineDetails";
import { ToolDurationFooter } from "./ToolDurationFooter";

const EditFileItem = memo(function EditFileItem({
  args,
  result,
  success,
  isPending,
  cancelled,
  startedAt,
  completedAt,
}: {
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
  const filePath = (args.file_path as string) || "";
  const fileName = filePath.split("/").pop() || filePath;
  const oldString = (args.old_string as string) || "";
  const newString = (args.new_string as string) || "";

  const canExpand = !!oldString || !!newString || !!result;
  const status = isPending
    ? "loading"
    : cancelled
      ? "cancelled"
      : success
        ? "success"
        : "error";

  const detailContent = canExpand && (
    <div className="p-4 sm:p-5 space-y-3">
      <ToolArgsBlock size="detail">
        <span className="truncate">{filePath}</span>
        <ToolHoverCopyButton text={filePath} position="args" />
      </ToolArgsBlock>
      {oldString && (
        <div>
          <div className="text-xs text-red-500 dark:text-red-400 mb-1.5 font-semibold uppercase tracking-wider">
            {t("chat.message.toolEditRemoved")}
          </div>
          <div className="relative group rounded-lg border border-red-200/60 dark:border-red-800/40 bg-red-50 dark:bg-red-950/30 overflow-hidden">
            <DeferredCodeMirrorViewer
              value={oldString}
              filePath={filePath}
              lineNumbers={false}
              fontSize="0.8rem"
              className="[&_.cm-editor]:bg-transparent dark:[&_.cm-editor]:bg-transparent"
            />
            <ToolHoverCopyButton
              text={oldString}
              size={14}
              position="panel"
              copyButtonClassName="!bg-theme-bg-card/80 !rounded-md !border !border-red-200 dark:!border-red-800"
            />
          </div>
        </div>
      )}
      {newString && (
        <div>
          <div className="text-xs text-emerald-500 dark:text-emerald-400 mb-1.5 font-semibold uppercase tracking-wider">
            {t("chat.message.toolEditAdded")}
          </div>
          <div className="relative group rounded-lg border border-emerald-200/60 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-950/30 overflow-hidden">
            <DeferredCodeMirrorViewer
              value={newString}
              filePath={filePath}
              lineNumbers={false}
              fontSize="0.8rem"
              className="[&_.cm-editor]:bg-transparent dark:[&_.cm-editor]:bg-transparent"
            />
            <ToolHoverCopyButton
              text={newString}
              size={14}
              position="panel"
              copyButtonClassName="!bg-theme-bg-card/80 !rounded-md !border !border-emerald-200 dark:!border-emerald-800"
            />
          </div>
        </div>
      )}
      {result &&
        (() => {
          const text = extractText(result);
          return text ? (
            <pre className="group/result relative text-xs text-theme-text-tertiary whitespace-pre-wrap break-words p-3 rounded-lg bg-theme-bg border border-theme-border">
              {text}
              <ToolHoverCopyButton
                text={text}
                position="result"
                copyButtonClassName="!bg-theme-bg-card/80 !rounded-md"
              />
            </pre>
          ) : null;
        })()}
    </div>
  );

  return (
    <>
      <CollapsiblePill
        status={status}
        icon={<Pencil size={12} className="shrink-0 opacity-50" />}
        label={`${t("chat.message.toolEdit")} ${filePath || ""}`}
        variant="tool"
        formatLabel={false}
        expandable={canExpand}
        onPanelOpen={() => {
          if (!canExpand) return;
          openPersistentToolPanel({
            title: `${t("chat.message.toolEdit")} ${fileName || filePath}`,
            icon: <Pencil size={16} />,
            status,
            subtitle: filePath,
            children: detailContent,
            footer: durationFooter,
          });
        }}
      >
        {canExpand && (
          <ToolInlineDetails>
            <ToolArgsBlock size="compact">
              <span className="truncate">{filePath}</span>
              <ToolHoverCopyButton text={filePath} position="argsCompact" />
            </ToolArgsBlock>
            {oldString && (
              <div className="mb-2">
                <div className="text-xs text-red-500 dark:text-red-400 mb-1 font-medium">
                  -
                </div>
                <div className="relative group overflow-y-auto rounded-md border border-red-200/60 dark:border-red-800/40 bg-red-50 dark:bg-red-950/30">
                  <DeferredCodeMirrorViewer
                    value={oldString}
                    filePath={filePath}
                    lineNumbers={false}
                    fontSize="0.75rem"
                    className="[&_.cm-editor]:bg-transparent dark:[&_.cm-editor]:bg-transparent"
                  />
                  <ToolHoverCopyButton
                    text={oldString}
                    position="panelCompact"
                    copyButtonClassName="!bg-theme-bg-card/80 !rounded-md !border !border-red-200 dark:!border-red-800"
                  />
                </div>
              </div>
            )}
            {newString && (
              <div className="mb-2">
                <div className="text-xs text-emerald-500 dark:text-emerald-400 mb-1 font-medium">
                  +
                </div>
                <div className="relative group overflow-y-auto rounded-md border border-emerald-200/60 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-950/30">
                  <DeferredCodeMirrorViewer
                    value={newString}
                    filePath={filePath}
                    lineNumbers={false}
                    fontSize="0.75rem"
                    className="[&_.cm-editor]:bg-transparent dark:[&_.cm-editor]:bg-transparent"
                  />
                  <ToolHoverCopyButton
                    text={newString}
                    position="panelCompact"
                    copyButtonClassName="!bg-theme-bg-card/80 !rounded-md !border !border-emerald-200 dark:!border-emerald-800"
                  />
                </div>
              </div>
            )}
            {result &&
              (() => {
                const text = extractText(result);
                return text ? (
                  <pre className="group/result relative text-xs text-theme-text-tertiary whitespace-pre-wrap break-words mt-1 overflow-y-auto min-w-0">
                    {text}
                    <ToolHoverCopyButton text={text} position="resultCompact" />
                  </pre>
                ) : null;
              })()}
          </ToolInlineDetails>
        )}
      </CollapsiblePill>
    </>
  );
});

export { EditFileItem };
