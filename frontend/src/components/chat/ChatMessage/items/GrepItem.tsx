import { memo, useMemo } from "react";
import { Search, FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CollapsiblePill } from "../../../common";
import { DeferredCodeMirrorViewer } from "../../../common/DeferredCodeMirrorViewer";
import { extractText } from "./toolUtils";
import { openPersistentToolPanel } from "./persistentToolPanelState";
import { ToolArgsBlock } from "./ToolArgsBlock";
import { ToolHoverCopyButton } from "./ToolHoverCopyButton";
import { ToolInlineDetails } from "./ToolInlineDetails";
import { ToolDurationFooter } from "./ToolDurationFooter";

const GrepItem = memo(function GrepItem({
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
  const pattern = (args.pattern as string) || "";
  const searchPath = (args.path as string) || "";
  const glob = (args.glob as string) || "";
  const outputMode = (args.output_mode as string) || "files_with_matches";

  const parsedResult = useMemo(() => {
    if (!result) return { files: [] as string[], lines: [] as string[] };
    const raw = extractText(result);
    try {
      const obj = JSON.parse(raw);
      if (Array.isArray(obj)) {
        const files: string[] = [];
        const lines: string[] = [];
        for (const item of obj) {
          if (typeof item === "string") {
            files.push(item);
          } else if (item && typeof item === "object") {
            const file = (item as Record<string, unknown>).file as string;
            if (file) files.push(file);
            const matches = (item as Record<string, unknown>).matches;
            if (Array.isArray(matches)) {
              for (const m of matches) {
                const match = m as Record<string, unknown>;
                lines.push(`${file}:${match.line ?? ""}:${match.text ?? ""}`);
              }
            }
          }
        }
        return { files, lines };
      }
    } catch {
      // 非 JSON，按行解析 ripgrep 风格输出
    }

    const lines: string[] = raw.split("\n").filter(Boolean);
    const files = [
      ...new Set(lines.map((l) => l.split(":")[0]).filter(Boolean)),
    ];
    return { files, lines };
  }, [result]);

  const canExpand =
    !!pattern || parsedResult.files.length > 0 || parsedResult.lines.length > 0;
  const status = isPending
    ? "loading"
    : cancelled
      ? "cancelled"
      : success
        ? "success"
        : "error";

  const detailContent = canExpand && (
    <div className="p-4 sm:p-5 space-y-4">
      <ToolArgsBlock size="detail" wrap>
        <Search
          size={14}
          className="shrink-0 text-violet-500 dark:text-violet-400"
        />
        <span className="text-violet-600 dark:text-violet-400 font-semibold font-mono">
          {pattern}
        </span>
        {searchPath && (
          <span className="text-theme-text-tertiary">in {searchPath}</span>
        )}
        {glob && (
          <span className="shrink-0 px-2 py-0.5 rounded-md bg-theme-bg-subtle text-theme-text-secondary text-xs ring-1 ring-theme-border/50">
            {glob}
          </span>
        )}
        <ToolHoverCopyButton text={pattern} position="args" />
      </ToolArgsBlock>
      {parsedResult.files.length > 0 && (
        <div>
          <div className="text-xs text-theme-text-tertiary mb-2">
            {t("chat.message.toolFileCount", {
              count: parsedResult.files.length,
            })}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {parsedResult.files.slice(0, 20).map((f, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-theme-bg-subtle text-xs text-theme-text-secondary font-mono"
              >
                <FileText size={11} className="shrink-0 opacity-40" />
                {f.split("/").pop() || f}
              </span>
            ))}
            {parsedResult.files.length > 20 && (
              <span className="text-xs text-theme-text-tertiary px-1 py-1">
                +{parsedResult.files.length - 20} more
              </span>
            )}
          </div>
        </div>
      )}
      {outputMode === "content" && parsedResult.lines.length > 0 && (
        <div className="relative group rounded-lg border border-theme-border overflow-hidden">
          <DeferredCodeMirrorViewer
            value={parsedResult.lines.join("\n")}
            lineNumbers={false}
            fontSize="0.8rem"
          />
          <ToolHoverCopyButton
            text={parsedResult.lines.join("\n")}
            size={14}
            position="panel"
            copyButtonClassName="!bg-theme-bg-card/80 !rounded-md !border !border-theme-border"
          />
        </div>
      )}
      {result &&
        (() => {
          const text = extractText(result);
          return text &&
            parsedResult.lines.length === 0 &&
            parsedResult.files.length === 0 ? (
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
        icon={<Search size={12} className="shrink-0 opacity-50" />}
        label={`${t("chat.message.toolSearch")} ${pattern || ""}`}
        variant="tool"
        expandable={canExpand}
        onPanelOpen={() => {
          if (!canExpand) return;
          openPersistentToolPanel({
            title: `${t("chat.message.toolSearch")} ${pattern}`,
            icon: <Search size={16} />,
            status,
            subtitle: searchPath || glob || undefined,
            children: detailContent,
            footer: durationFooter,
          });
        }}
      >
        {canExpand && (
          <ToolInlineDetails>
            <ToolArgsBlock size="compact" wrap>
              <span className="text-violet-600 dark:text-violet-400 font-semibold">
                {pattern}
              </span>
              {searchPath && (
                <span className="text-theme-text-tertiary">
                  {t("chat.message.toolInPath", { path: searchPath })}
                </span>
              )}
              {glob && (
                <span className="shrink-0 px-1.5 py-0.5 rounded bg-theme-bg-subtle text-theme-text-secondary">
                  {glob}
                </span>
              )}
              <ToolHoverCopyButton text={pattern} position="argsCompact" />
            </ToolArgsBlock>
            {parsedResult.files.length > 0 && (
              <div className="mb-2">
                <div className="text-xs text-theme-text-tertiary mb-1">
                  {t("chat.message.toolFileCount", {
                    count: parsedResult.files.length,
                  })}
                </div>
                <div className="flex flex-wrap gap-1">
                  {parsedResult.files.slice(0, 10).map((f, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-theme-bg-subtle text-xs text-theme-text-secondary font-mono"
                    >
                      <FileText size={10} className="shrink-0 opacity-40" />
                      {f.split("/").pop() || f}
                    </span>
                  ))}
                  {parsedResult.files.length > 10 && (
                    <span className="text-xs text-theme-text-tertiary px-1">
                      {t("chat.message.toolMoreFiles", {
                        count: parsedResult.files.length - 10,
                      })}
                    </span>
                  )}
                </div>
              </div>
            )}
            {outputMode === "content" && parsedResult.lines.length > 0 && (
              <div className="relative group max-h-48 overflow-y-auto rounded-md border border-theme-border">
                <DeferredCodeMirrorViewer
                  value={parsedResult.lines.slice(0, 50).join("\n")}
                  lineNumbers={false}
                  fontSize="0.75rem"
                />
                <ToolHoverCopyButton
                  text={parsedResult.lines.slice(0, 50).join("\n")}
                  position="panelCompact"
                  copyButtonClassName="!bg-theme-bg-card/80 !rounded-md !border !border-theme-border"
                />
                {parsedResult.lines.length > 50 && (
                  <div className="text-theme-text-tertiary mt-1 text-xs px-2 pb-2">
                    {t("chat.message.toolMoreLines", {
                      count: parsedResult.lines.length - 50,
                    })}
                  </div>
                )}
              </div>
            )}
            {result &&
              (() => {
                const text = extractText(result);
                return text &&
                  parsedResult.lines.length === 0 &&
                  parsedResult.files.length === 0 ? (
                  <pre className="group/result relative text-xs text-theme-text-tertiary whitespace-pre-wrap break-words overflow-y-auto min-w-0">
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

export { GrepItem };
