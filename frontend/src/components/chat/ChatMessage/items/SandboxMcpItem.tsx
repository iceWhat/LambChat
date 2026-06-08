import { memo, useMemo } from "react";
import { clsx } from "clsx";
import { KeyRound, Server, Terminal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CollapsiblePill } from "../../../common";
import { extractText } from "./toolUtils";
import { openPersistentToolPanel } from "./persistentToolPanelState";
import { ToolArgsBlock } from "./ToolArgsBlock";
import { ToolInlineDetails } from "./ToolInlineDetails";
import { ToolHoverCopyButton } from "./ToolHoverCopyButton";
import { ToolDurationFooter } from "./ToolDurationFooter";

function getActionLabel(
  toolName: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const map: Record<string, string> = {
    sandbox_mcp_add: "chat.message.toolSandboxMcpAdd",
    sandbox_mcp_update: "chat.message.toolSandboxMcpUpdate",
    sandbox_mcp_remove: "chat.message.toolSandboxMcpRemove",
  };
  return t(map[toolName] || "chat.message.toolSandboxMcp");
}

const SandboxMcpItem = memo(function SandboxMcpItem({
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
  const serverName = (args.server_name as string) || "";
  const command = (args.command as string) || "";
  const envKeys = (args.env_keys as string) || "";

  const envKeyList = useMemo(() => {
    if (!envKeys) return [];
    return envKeys
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
  }, [envKeys]);

  // Parse result for structured display
  const parsedResult = useMemo(() => {
    const text = extractText(result);
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }, [result]);

  const resultStatus = parsedResult?.status || parsedResult?.success;
  const resultMessage = parsedResult?.message || "";

  const canExpand = !!serverName || !!command || !!result;
  const pillStatus = isPending
    ? "loading"
    : cancelled
      ? "cancelled"
      : success
        ? "success"
        : "error";

  const labelSuffix = serverName || command || "";

  // ── Panel detail content ──

  const detailContent = canExpand && (
    <div className="p-4 sm:p-5 space-y-4">
      {/* Server info card */}
      {serverName && (
        <div className="rounded-xl border border-theme-border overflow-hidden">
          <div className="flex items-center gap-2.5 px-3 py-2.5 bg-teal-50/60 dark:bg-teal-900/10 border-b border-theme-border">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-teal-100/70 dark:bg-teal-900/20">
              <Server size={14} className="text-teal-500 dark:text-teal-400" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-sm font-mono text-theme-text font-medium truncate block">
                {serverName}
              </span>
            </div>
            <ToolHoverCopyButton
              text={serverName}
              position="args"
              copyButtonClassName="!bg-theme-bg/80 !rounded-md !border !border-theme-border"
            />
          </div>

          {/* Command block */}
          {command && (
            <div className="px-3 py-2.5 bg-theme-bg">
              <div className="group/cmd relative overflow-hidden rounded-lg bg-teal-950 px-3 py-2.5 text-sm font-mono border border-teal-500/20 shadow-sm">
                <div className="flex items-center gap-2 text-teal-100">
                  <Terminal size={13} className="shrink-0 text-teal-300" />
                  <span className="text-teal-300 font-semibold">$</span>
                  <span className="break-all min-w-0">{command}</span>
                </div>
                <ToolHoverCopyButton
                  text={command}
                  position="args"
                  copyButtonClassName="!bg-white/10 hover:!bg-white/20 !text-teal-100 !border !border-teal-500/30"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Env keys */}
      {envKeyList.length > 0 && (
        <div className="rounded-xl border border-theme-border bg-theme-bg">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-theme-border/50">
            <KeyRound size={11} className="text-teal-500 dark:text-teal-400" />
            <span className="text-xs font-medium text-theme-text-secondary">
              Env Keys
            </span>
            <span className="text-[10px] text-theme-text-tertiary ml-auto">
              {envKeyList.length}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 px-3 py-2">
            {envKeyList.map((k, i) => (
              <span
                key={i}
                className={clsx(
                  "inline-flex items-center gap-1 px-2 py-1 rounded-lg",
                  "bg-teal-50/60 dark:bg-teal-900/10 border border-teal-200/50 dark:border-teal-800/30",
                  "text-xs text-teal-700 dark:text-teal-300 font-mono",
                )}
              >
                <KeyRound
                  size={10}
                  className="shrink-0 text-teal-500 dark:text-teal-400 opacity-70"
                />
                {k}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Structured result */}
      {result && !parsedResult && (
        <pre className="group/result relative text-xs text-theme-text-tertiary whitespace-pre-wrap break-words p-3 rounded-lg bg-theme-bg border border-theme-border">
          {(() => {
            const text = extractText(result);
            return text.length > 600 ? text.slice(0, 597) + "…" : text;
          })()}
          <ToolHoverCopyButton
            text={extractText(result)}
            position="result"
            copyButtonClassName="!bg-theme-bg-card/80 !rounded-md !border !border-theme-border"
          />
        </pre>
      )}

      {/* Parsed result message */}
      {parsedResult && resultMessage && (
        <div
          className={clsx(
            "rounded-xl border px-3 py-2.5 text-xs",
            resultStatus === true || resultStatus === "active"
              ? "bg-emerald-50/60 dark:bg-emerald-900/10 border-emerald-200/50 dark:border-emerald-800/30 text-emerald-700 dark:text-emerald-300"
              : resultStatus === false
                ? "bg-red-50/60 dark:bg-red-900/10 border-red-200/50 dark:border-red-800/30 text-red-700 dark:text-red-300"
                : "bg-theme-bg border-theme-border text-theme-text-secondary",
          )}
        >
          {resultMessage}
        </div>
      )}
    </div>
  );

  // ── Inline (compact) view ──

  return (
    <>
      <CollapsiblePill
        status={pillStatus}
        icon={
          <Terminal
            size={12}
            className="shrink-0 text-teal-500 dark:text-teal-400 opacity-80"
          />
        }
        label={`${actionLabel} ${
          labelSuffix.length > 50 ? labelSuffix.slice(0, 47) + "…" : labelSuffix
        }`}
        variant="tool"
        expandable={canExpand}
        onPanelOpen={() => {
          if (!canExpand) return;
          openPersistentToolPanel({
            title: actionLabel,
            icon: <Terminal size={16} />,
            status: pillStatus,
            subtitle: serverName || command || undefined,
            children: detailContent,
            footer: durationFooter,
          });
        }}
      >
        {canExpand && (
          <ToolInlineDetails>
            {serverName && (
              <ToolArgsBlock size="compact">
                <Server
                  size={12}
                  className="shrink-0 text-teal-500 dark:text-teal-400"
                />
                <span className="truncate text-theme-text font-medium font-mono">
                  {serverName}
                </span>
                <ToolHoverCopyButton text={serverName} position="argsCompact" />
              </ToolArgsBlock>
            )}

            {command && (
              <div className="group/cmd relative rounded-md bg-theme-bg border border-theme-border px-2 py-1.5 text-xs font-mono flex items-center gap-2 flex-wrap hover:border-teal-200 dark:hover:border-teal-800/50 transition-colors">
                <Terminal
                  size={10}
                  className="shrink-0 text-teal-500 dark:text-teal-400"
                />
                <span className="text-teal-600 dark:text-teal-300 font-semibold">
                  $
                </span>
                <span className="text-theme-text-secondary break-all min-w-0">
                  {command.length > 120 ? command.slice(0, 117) + "…" : command}
                </span>
                <ToolHoverCopyButton
                  text={command}
                  position="argsCompact"
                  copyButtonClassName="!bg-theme-bg-card/80 !rounded-md !border !border-theme-border"
                />
              </div>
            )}

            {envKeyList.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {envKeyList.map((k, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-theme-bg border border-theme-border text-[10px] text-theme-text-secondary font-mono hover:border-teal-200 dark:hover:border-teal-800/50 transition-colors"
                  >
                    <KeyRound
                      size={8}
                      className="shrink-0 text-teal-500 dark:text-teal-400 opacity-70"
                    />
                    {k}
                  </span>
                ))}
              </div>
            )}

            {result && (
              <pre className="group/result relative text-xs text-theme-text-tertiary whitespace-pre-wrap break-words overflow-y-auto min-w-0">
                {(() => {
                  const text = extractText(result);
                  return text.length > 300 ? text.slice(0, 297) + "…" : text;
                })()}
                <ToolHoverCopyButton
                  text={extractText(result)}
                  position="resultCompact"
                />
              </pre>
            )}
          </ToolInlineDetails>
        )}
      </CollapsiblePill>
    </>
  );
});

export { SandboxMcpItem };
