import { memo, useMemo } from "react";
import { clsx } from "clsx";
import { UserRound, Tag, Sparkles, Zap, MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CollapsiblePill } from "../../../common";
import { extractText } from "./toolUtils";
import { openPersistentToolPanel } from "./persistentToolPanelState";
import { ToolInlineDetails } from "./ToolInlineDetails";
import { ToolHoverCopyButton } from "./ToolHoverCopyButton";
import { ToolDurationFooter } from "./ToolDurationFooter";
import { nameToGradient } from "../../../common/cardUtils";
import { MarkdownContent } from "../MarkdownContent";
import { DetailSection } from "./DetailSection";

// ── PersonaItem ──────────────────────────────────────────────────────

const PersonaItem = memo(function PersonaItem({
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

  const personaName = (args.name as string) || "";

  // Backend returns {success, action, preset: {...PersonaPreset}, message}
  const parsed = useMemo(() => {
    const text = extractText(result);
    if (!text) return null;
    try {
      const raw = JSON.parse(text);
      if (raw?.preset && typeof raw.preset === "object") return raw.preset;
      return raw;
    } catch {
      return null;
    }
  }, [result]);

  const displayName = parsed?.name || personaName;
  const description = parsed?.description || "";
  const avatar = parsed?.avatar || (args.avatar as string) || "";
  const tags: string[] = parsed?.tags || (args.tags as string[]) || [];
  const presetId = parsed?.id || (args.preset_id as string) || "";
  const systemPrompt = parsed?.system_prompt || "";
  const starterPrompts: Array<{
    icon?: string | null;
    text: string | Record<string, string>;
  }> = parsed?.starter_prompts || [];
  const skillNames: string[] = parsed?.skill_names || [];
  const statusVal = parsed?.status || "";

  const gradient = useMemo(
    () => (displayName ? nameToGradient(displayName) : null),
    [displayName],
  );

  const canExpand =
    !!displayName || !!description || tags.length > 0 || !!result;
  const status = isPending
    ? "loading"
    : cancelled
      ? "cancelled"
      : success
        ? "success"
        : "error";

  // ── Panel detail content ──

  const detailContent = canExpand && (
    <div className="p-4 sm:p-5 space-y-4">
      {/* Hero card */}
      {displayName && (
        <div className="rounded-2xl overflow-hidden border border-theme-border shadow-sm">
          {gradient && (
            <div
              className="h-20 sm:h-24 relative"
              style={{
                background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]}, ${gradient[2]})`,
              }}
            >
              {/* Subtle shimmer pattern */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-black/5" />
              <div className="absolute bottom-0 inset-x-0 h-6 bg-gradient-to-t from-black/8 to-transparent" />
            </div>
          )}
          <div
            className={clsx(
              "relative px-4 sm:px-5 pt-4 pb-4",
              "bg-theme-bg-card",
              !gradient && "pt-5",
            )}
          >
            {/* Avatar + Name row */}
            <div
              className={clsx(
                "flex items-start gap-3.5",
                gradient ? "-mt-8 sm:-mt-10" : "",
              )}
            >
              <div
                className={clsx(
                  "rounded-2xl flex items-center justify-center text-2xl sm:text-3xl leading-none shrink-0",
                  "ring-[3px] ring-theme-bg-card shadow-lg shadow-black/8",
                  "bg-violet-100 dark:bg-violet-900/30",
                  gradient ? "w-14 h-14 sm:w-16 sm:h-16" : "w-11 h-11",
                )}
              >
                {avatar || (
                  <UserRound
                    size={gradient ? 28 : 22}
                    className="text-violet-500 dark:text-violet-400"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base sm:text-lg font-bold text-theme-text truncate">
                    {displayName}
                  </h3>
                  {statusVal && statusVal !== "published" && (
                    <span
                      className={clsx(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase",
                        statusVal === "draft"
                          ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200/50 dark:ring-amber-800/30"
                          : statusVal === "archived"
                            ? "bg-stone-100 dark:bg-stone-700/40 text-stone-500 dark:text-stone-400 ring-1 ring-stone-200/50 dark:ring-stone-600/30"
                            : "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200/50 dark:ring-emerald-800/30",
                      )}
                    >
                      {statusVal}
                    </span>
                  )}
                </div>
                {description && (
                  <p className="text-xs sm:text-sm text-theme-text-tertiary mt-1 leading-relaxed line-clamp-2">
                    {description}
                  </p>
                )}
              </div>
              {presetId && (
                <ToolHoverCopyButton
                  text={presetId}
                  position="args"
                  copyButtonClassName="!bg-theme-bg/80 !rounded-lg !border !border-theme-border !mt-0.5"
                />
              )}
            </div>

            {/* Tags + Skills */}
            {(tags.length > 0 || skillNames.length > 0) && (
              <div className="mt-4 space-y-2.5">
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag, i) => (
                      <span
                        key={i}
                        className={clsx(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium",
                          "bg-violet-100/70 dark:bg-violet-900/25 text-violet-700 dark:text-violet-300",
                          "ring-1 ring-violet-200/40 dark:ring-violet-800/30",
                        )}
                      >
                        <Tag size={10} className="opacity-40" />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {skillNames.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {skillNames.map((skill, i) => (
                      <span
                        key={i}
                        className={clsx(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium",
                          "bg-emerald-100/70 dark:bg-emerald-900/25 text-emerald-700 dark:text-emerald-300",
                          "ring-1 ring-emerald-200/40 dark:ring-emerald-800/30",
                        )}
                      >
                        <Zap size={10} className="opacity-40" />
                        {skill}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* System Prompt */}
      {systemPrompt && (
        <DetailSection
          title={t("chat.message.systemPrompt", "System Prompt")}
          icon={<Sparkles size={12} />}
          defaultExpanded={false}
          badge={
            <span className="text-[10px] text-theme-text-tertiary tabular-nums">
              {systemPrompt.length > 1000
                ? `${Math.round(systemPrompt.length / 100) / 10}k`
                : `${systemPrompt.length}`}
            </span>
          }
        >
          <div className="rounded-lg overflow-hidden border border-theme-border bg-theme-bg p-3 sm:p-4 [&_.markdown-content]:text-xs sm:[&_.markdown-content]:text-sm [&_.markdown-content_p:first-child]:mt-0 [&_.markdown-content_p:last-child]:mb-0">
            <MarkdownContent content={systemPrompt} />
          </div>
          <div className="flex justify-end mt-2">
            <ToolHoverCopyButton
              text={systemPrompt}
              position="result"
              copyButtonClassName="!bg-theme-bg !rounded-lg !border !border-theme-border"
            />
          </div>
        </DetailSection>
      )}

      {/* Starter Prompts */}
      {starterPrompts.length > 0 && (
        <DetailSection
          title={t("chat.message.starterPrompts", "Starter Prompts")}
          icon={<MessageSquare size={12} />}
          defaultExpanded={true}
          badge={
            <span className="text-[10px] text-theme-text-tertiary tabular-nums">
              {starterPrompts.length}
            </span>
          }
        >
          <div className="space-y-2">
            {starterPrompts.map((sp, i) => {
              const text =
                typeof sp.text === "string"
                  ? sp.text
                  : sp.text?.zh ||
                    sp.text?.en ||
                    Object.values(sp.text)[0] ||
                    "";
              return (
                <div
                  key={i}
                  className={clsx(
                    "flex items-center gap-3 px-3.5 py-2.5 rounded-xl",
                    "bg-theme-bg border border-theme-border",
                    "hover:border-violet-200 dark:hover:border-violet-800/50",
                    "hover:bg-violet-50/50 dark:hover:bg-violet-950/20",
                    "transition-all duration-200",
                  )}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg shrink-0 bg-violet-100/60 dark:bg-violet-900/20">
                    {sp.icon || (
                      <MessageSquare
                        size={14}
                        className="text-violet-400 dark:text-violet-500"
                      />
                    )}
                  </div>
                  <span className="text-sm text-theme-text leading-relaxed line-clamp-2">
                    {text}
                  </span>
                </div>
              );
            })}
          </div>
        </DetailSection>
      )}

      {/* Raw result fallback */}
      {result && !displayName && (
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
    </div>
  );

  // ── Inline (compact) view ──

  return (
    <>
      <CollapsiblePill
        status={status}
        icon={<UserRound size={12} className="shrink-0 opacity-50" />}
        label={`${t("chat.message.toolPersonaPreset")} ${displayName || ""}`}
        variant="tool"
        expandable={canExpand}
        onPanelOpen={() => {
          if (!canExpand) return;
          openPersistentToolPanel({
            title: t("chat.message.toolPersonaPreset"),
            icon: <UserRound size={16} />,
            status,
            subtitle: displayName || undefined,
            children: detailContent,
            footer: durationFooter,
          });
        }}
      >
        {canExpand && (
          <ToolInlineDetails>
            {(displayName || avatar) && (
              <div
                className={clsx(
                  "flex items-center gap-2 rounded-lg px-2.5 py-2",
                  "bg-theme-bg border border-theme-border",
                  "hover:border-violet-200 dark:hover:border-violet-800/50 transition-colors",
                )}
              >
                <div
                  className={clsx(
                    "w-6 h-6 rounded-md flex items-center justify-center text-sm leading-none shrink-0 overflow-hidden",
                    "bg-violet-100/60 dark:bg-violet-900/20",
                  )}
                >
                  {avatar ? (
                    <span className="text-xs">{avatar}</span>
                  ) : (
                    <UserRound
                      size={12}
                      className="text-violet-500 dark:text-violet-400"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-theme-text font-medium truncate">
                    {displayName}
                  </div>
                  {description && (
                    <div className="text-[10px] text-theme-text-tertiary truncate">
                      {description}
                    </div>
                  )}
                </div>
                {skillNames.length > 0 && (
                  <span className="shrink-0 text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 rounded-md">
                    {skillNames.length} skills
                  </span>
                )}
              </div>
            )}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tags.slice(0, 8).map((tag, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-100/60 dark:bg-violet-900/20 text-violet-600 dark:text-violet-300 text-[10px]"
                  >
                    <Tag size={7} className="opacity-50" />
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {result && !displayName && (
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

export { PersonaItem };
