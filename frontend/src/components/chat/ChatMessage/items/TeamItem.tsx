import { memo, useMemo } from "react";
import { clsx } from "clsx";
import { Users, Tag } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CollapsiblePill } from "../../../common";
import { extractText } from "./toolUtils";
import { openPersistentToolPanel } from "./persistentToolPanelState";
import { ToolInlineDetails } from "./ToolInlineDetails";
import { ToolHoverCopyButton } from "./ToolHoverCopyButton";
import { ToolDurationFooter } from "./ToolDurationFooter";
import { nameToGradient } from "../../../common/cardUtils";
import { DetailSection } from "./DetailSection";

// ── TeamItem ──────────────────────────────────────────────────────────

const TeamItem = memo(function TeamItem({
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

  const isSearch = toolName === "search_persona_presets";
  const actionLabel = isSearch
    ? t("chat.message.toolSearchPersonas")
    : t("chat.message.toolCreateTeam");

  const query = (args.query as string) || "";
  const teamName = (args.name as string) || "";
  const teamAvatar = (args.avatar as string) || "";
  const members: Array<Record<string, unknown>> =
    (args.members as Array<Record<string, unknown>>) || [];

  const parsed = useMemo(() => {
    const text = extractText(result);
    if (!text) return null;
    try {
      const raw = JSON.parse(text);
      if (raw?.team && typeof raw.team === "object") return raw.team;
      return raw;
    } catch {
      return null;
    }
  }, [result]);

  const personas: Array<Record<string, unknown>> = useMemo(() => {
    if (!isSearch || !parsed) return [];
    if (Array.isArray(parsed)) return parsed as Array<Record<string, unknown>>;
    if (Array.isArray(parsed.items))
      return parsed.items as Array<Record<string, unknown>>;
    if (Array.isArray(parsed.presets))
      return parsed.presets as Array<Record<string, unknown>>;
    return [];
  }, [isSearch, parsed]);

  const resultTeamName = parsed?.name || teamName;
  const resultAvatar = parsed?.avatar || teamAvatar;
  const resultMembers: Array<Record<string, unknown>> =
    parsed?.members || members || [];
  const resultId = parsed?.id || "";
  const resultTags: string[] = parsed?.tags || [];
  const resultDescription = parsed?.description || "";

  const teamGradient = useMemo(
    () => (resultTeamName ? nameToGradient(resultTeamName) : null),
    [resultTeamName],
  );

  const canExpand =
    !!query ||
    !!teamName ||
    personas.length > 0 ||
    resultMembers.length > 0 ||
    !!result;
  const pillStatus = isPending
    ? "loading"
    : cancelled
      ? "cancelled"
      : success
        ? "success"
        : "error";

  const labelSuffix = isSearch ? query : resultTeamName || teamName || "";

  // ── Panel detail content ──

  const detailContent = canExpand && (
    <div className="p-4 sm:p-5 space-y-4">
      {/* Search: persona list */}
      {isSearch && personas.length > 0 && (
        <DetailSection
          title={t("chat.message.toolPersonaCount", {
            count: personas.length,
          })}
          icon={<Users size={12} />}
          defaultExpanded={true}
        >
          <div className="space-y-2">
            {personas.slice(0, 20).map((p, i) => {
              const name = String(p.name || `Persona ${i + 1}`);
              const desc = String(p.description || "");
              const av = String(p.avatar || "");
              const pTags: string[] = Array.isArray(p.tags) ? p.tags : [];
              const pGradient = nameToGradient(name);

              return (
                <div
                  key={i}
                  className="rounded-xl overflow-hidden border border-theme-border hover:border-sky-200 dark:hover:border-sky-800/50 transition-colors"
                >
                  <div
                    className="h-6 relative"
                    style={{
                      background: `linear-gradient(135deg, ${pGradient[0]}, ${pGradient[1]}, ${pGradient[2]})`,
                    }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent" />
                  </div>
                  <div className="px-3 py-2 bg-theme-bg-card -mt-3 relative">
                    <div className="flex items-end gap-2.5">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm leading-none shrink-0 ring-2 ring-theme-bg-card shadow-sm bg-sky-100/60 dark:bg-sky-900/20">
                        {av || (
                          <Users
                            size={12}
                            className="text-sky-500 dark:text-sky-400"
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 pb-0.5">
                        <div className="text-xs text-theme-text font-medium truncate">
                          {name}
                        </div>
                        {desc && (
                          <div className="text-[10px] text-theme-text-tertiary truncate mt-0.5 leading-snug">
                            {desc}
                          </div>
                        )}
                      </div>
                    </div>
                    {pTags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {pTags.slice(0, 4).map((tag, j) => (
                          <span
                            key={j}
                            className="inline-flex items-center gap-1 px-1.5 py-px rounded-md bg-sky-100/50 dark:bg-sky-900/15 text-sky-600 dark:text-sky-300 text-[10px]"
                          >
                            <Tag size={7} className="opacity-50" />
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </DetailSection>
      )}

      {/* Team: hero card */}
      {!isSearch && (resultTeamName || resultMembers.length > 0) && (
        <>
          {resultTeamName && (
            <div className="rounded-xl overflow-hidden border border-theme-border">
              {teamGradient && (
                <div
                  className="h-14 sm:h-16 relative"
                  style={{
                    background: `linear-gradient(135deg, ${teamGradient[0]}, ${teamGradient[1]}, ${teamGradient[2]})`,
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
                </div>
              )}
              <div
                className={clsx(
                  "relative px-4 py-3",
                  "bg-theme-bg-card",
                  !teamGradient && "pt-4",
                )}
              >
                <div
                  className={clsx(
                    "flex items-end gap-3",
                    teamGradient ? "-mt-6 sm:-mt-7" : "",
                  )}
                >
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-xl sm:text-2xl leading-none shrink-0 ring-3 ring-theme-bg-card shadow-lg bg-sky-100/60 dark:bg-sky-900/20">
                    {resultAvatar || (
                      <Users
                        size={teamGradient ? 22 : 18}
                        className="text-sky-500 dark:text-sky-400"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 pb-0.5">
                    <h3 className="text-sm sm:text-base font-bold text-theme-text truncate">
                      {resultTeamName}
                    </h3>
                    {resultId && (
                      <div className="text-[10px] sm:text-xs text-theme-text-tertiary font-mono truncate mt-0.5 flex items-center gap-1">
                        <span className="truncate">{resultId}</span>
                        <ToolHoverCopyButton
                          text={resultId}
                          position="args"
                          copyButtonClassName="!bg-theme-bg/80 !rounded !border !border-theme-border"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {resultDescription && (
                  <p className="text-xs text-theme-text-tertiary mt-2 line-clamp-2 leading-relaxed">
                    {resultDescription}
                  </p>
                )}

                {resultTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {resultTags.map((tag, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-100/60 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 text-xs"
                      >
                        <Tag size={9} className="opacity-50" />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Members */}
          {resultMembers.length > 0 && (
            <DetailSection
              title={t("chat.message.toolMemberCount", {
                count: resultMembers.length,
              })}
              icon={<Users size={12} />}
              defaultExpanded={true}
            >
              <div className="space-y-2">
                {resultMembers.map((m, i) => {
                  const roleName = String(
                    m.role_name || m.name || `Member ${i + 1}`,
                  );
                  const roleAvatar = String(m.role_avatar || m.avatar || "");
                  const instructions = String(m.role_instructions || "");
                  const mTags: string[] = Array.isArray(m.tags)
                    ? (m.tags as string[])
                    : [];

                  return (
                    <div
                      key={i}
                      className="rounded-lg border border-theme-border bg-theme-bg hover:border-sky-200 dark:hover:border-sky-800/50 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 px-3 py-2">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm leading-none shrink-0 bg-sky-100/60 dark:bg-sky-900/20">
                          {roleAvatar || "?"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-theme-text font-medium truncate">
                            {roleName}
                          </div>
                          {mTags.length > 0 && (
                            <div className="flex flex-wrap gap-0.5 mt-0.5">
                              {mTags.slice(0, 3).map((tag, j) => (
                                <span
                                  key={j}
                                  className="inline-flex items-center px-1 py-px rounded text-[9px] bg-sky-100/40 dark:bg-sky-900/15 text-sky-600 dark:text-sky-300"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      {instructions && (
                        <div className="px-3 pb-2.5 pt-0">
                          <p className="text-[11px] text-theme-text-tertiary line-clamp-3 leading-relaxed">
                            {instructions}
                          </p>
                          {instructions.length > 150 && (
                            <ToolHoverCopyButton
                              text={instructions}
                              position="result"
                              copyButtonClassName="!bg-theme-bg !rounded-md !border !border-theme-border mt-1.5"
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </DetailSection>
          )}
        </>
      )}

      {/* Raw result fallback */}
      {result &&
        personas.length === 0 &&
        !resultTeamName &&
        !resultMembers.length && (
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
        status={pillStatus}
        icon={<Users size={12} className="shrink-0 opacity-50" />}
        label={`${actionLabel}${
          labelSuffix
            ? ` ${
                labelSuffix.length > 40
                  ? labelSuffix.slice(0, 37) + "…"
                  : labelSuffix
              }`
            : ""
        }`}
        variant="tool"
        expandable={canExpand}
        onPanelOpen={() => {
          if (!canExpand) return;
          openPersistentToolPanel({
            title: actionLabel,
            icon: <Users size={16} />,
            status: pillStatus,
            subtitle: labelSuffix
              ? labelSuffix.length > 80
                ? labelSuffix.slice(0, 77) + "…"
                : labelSuffix
              : undefined,
            children: detailContent,
            footer: durationFooter,
          });
        }}
      >
        {canExpand && (
          <ToolInlineDetails>
            {isSearch && personas.length > 0 && (
              <div>
                <div className="text-xs text-theme-text-tertiary mb-1">
                  {t("chat.message.toolPersonaCount", {
                    count: personas.length,
                  })}
                </div>
                <div className="flex flex-wrap gap-1">
                  {personas.slice(0, 8).map((p, i) => {
                    const name = String(p.name || `#${i + 1}`);
                    const av = String(p.avatar || "");
                    return (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-theme-bg border border-theme-border text-[10px] text-theme-text-secondary hover:border-sky-200 dark:hover:border-sky-800/50 transition-colors"
                      >
                        {av ? (
                          <span className="text-[9px]">{av}</span>
                        ) : (
                          <Users
                            size={8}
                            className="shrink-0 text-sky-500 dark:text-sky-400 opacity-60"
                          />
                        )}
                        {name}
                      </span>
                    );
                  })}
                  {personas.length > 8 && (
                    <span className="text-[10px] text-theme-text-tertiary px-1">
                      +{personas.length - 8}
                    </span>
                  )}
                </div>
              </div>
            )}

            {!isSearch && resultTeamName && (
              <div className="flex items-center gap-2 rounded-lg px-2.5 py-2 bg-theme-bg border border-theme-border hover:border-sky-200 dark:hover:border-sky-800/50 transition-colors">
                <div className="w-5 h-5 rounded flex items-center justify-center text-xs leading-none shrink-0 bg-sky-100/60 dark:bg-sky-900/20">
                  {resultAvatar || (
                    <Users
                      size={10}
                      className="text-sky-500 dark:text-sky-400"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-theme-text font-medium truncate">
                    {resultTeamName}
                  </div>
                </div>
                {resultMembers.length > 0 && (
                  <span className="shrink-0 text-[10px] text-theme-text-tertiary">
                    {t("chat.message.toolMemberCount", {
                      count: resultMembers.length,
                    })}
                  </span>
                )}
              </div>
            )}

            {result && personas.length === 0 && !resultTeamName && (
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

export { TeamItem };
