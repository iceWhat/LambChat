import { useState, useRef, useEffect, useCallback, useMemo, memo } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { Ban, X, CircleHelp, Keyboard, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { uploadApi, getFullUrl } from "../../services/api";
import { AttachmentCard } from "../common/AttachmentCard";
import { ImageViewer } from "../common";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { ContactAdminDialog } from "../common/ContactAdminDialog";
import { useFileUpload } from "../../hooks/useFileUpload";
import { useMentionState } from "../../hooks/useMentionState";
import { useMentionSearch } from "../../hooks/useMentionSearch";
import { useInputHistory } from "../../hooks/useInputHistory";
import { useTextareaResize } from "../../hooks/useTextareaResize";
import { usePasteHandler } from "../../hooks/usePasteHandler";
import { openAttachmentPreview } from "./attachmentPreviewStore";
import { MentionPopup } from "./MentionPopup";
import { ChatInputToolbar } from "./ChatInputToolbar";
import { ChatInputSelectors } from "./ChatInputSelectors";
import { getMentionPopupFixedPlacement } from "./chatInputViewport";
import {
  consumePendingSelectionActionPrompt,
  SELECTION_ACTION_EVENT,
  type SelectionActionEventDetail,
} from "../common/selectionActionPopover";
import type { FeaturePanel } from "../selectors/FeatureMenu";
import type {
  ToolState,
  ToolCategory,
  SkillResponse,
  SkillSource,
  AgentOption,
  MessageAttachment,
  PersonaPreset,
  PersonaPresetSnapshot,
  FileCategory,
} from "../../types";
import { Permission } from "../../types";
import { useAuth } from "../../hooks/useAuth";

const FILE_CATEGORY_PERMISSIONS: Record<FileCategory, Permission> = {
  image: Permission.FILE_UPLOAD_IMAGE,
  video: Permission.FILE_UPLOAD_VIDEO,
  audio: Permission.FILE_UPLOAD_AUDIO,
  document: Permission.FILE_UPLOAD_DOCUMENT,
};

function ShortcutRow({
  label,
  keys,
  macKeys,
}: {
  label: string;
  keys: string[];
  macKeys?: string[];
}) {
  const isMac =
    typeof navigator !== "undefined" &&
    navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const displayKeys = isMac && macKeys ? macKeys : keys;
  return (
    <div className="flex items-center justify-between gap-4">
      <span>{label}</span>
      <div className="flex gap-1">
        {displayKeys.map((key) => (
          <kbd
            key={key}
            className="px-1.5 py-0.5 rounded text-[11px] font-mono"
            style={{
              backgroundColor: "var(--theme-bg-hover, rgba(128,128,128,0.1))",
              border: "1px solid var(--theme-border)",
              color: "var(--theme-text-secondary)",
            }}
          >
            {key}
          </kbd>
        ))}
      </div>
    </div>
  );
}

export interface ChatInputProps {
  onSend: (
    message: string,
    options?: Record<string, boolean | string | number>,
    attachments?: MessageAttachment[],
  ) => void;
  onStop: () => void;
  isLoading: boolean;
  disabled?: boolean;
  canSend?: boolean;
  tools?: ToolState[];
  onToggleTool?: (toolName: string) => void;
  onToggleCategory?: (category: ToolCategory, enabled: boolean) => void;
  onToggleAll?: (enabled: boolean) => void;
  toolsLoading?: boolean;
  enabledToolsCount?: number;
  totalToolsCount?: number;
  skills?: SkillResponse[];
  onToggleSkill?: (name: string) => Promise<boolean>;
  onToggleSkillCategory?: (
    category: SkillSource,
    enabled: boolean,
  ) => Promise<boolean>;
  onToggleAllSkills?: (enabled: boolean) => Promise<boolean>;
  skillsLoading?: boolean;
  pendingSkillNames?: string[];
  skillsMutating?: boolean;
  enabledSkillsCount?: number;
  totalSkillsCount?: number;
  enableSkills?: boolean;
  personaPresets?: PersonaPreset[];
  personaPresetsTotal?: number;
  personaPresetsPage?: number;
  onPersonaPresetsPageChange?: (page: number) => void;
  onPersonaPresetsSearchChange?: (query: string) => void;
  onPersonaPresetsTagChange?: (tag: string | null) => void;
  selectedPersonaPresetId?: string | null;
  selectedPersonaName?: string | null;
  personaSkillsControlled?: boolean;
  personaPresetsLoading?: boolean;
  personaPresetsMutating?: boolean;
  onUsePersonaPreset?: (
    preset: PersonaPreset,
  ) => Promise<PersonaPresetSnapshot | null>;
  onCopyPersonaPreset?: (preset: PersonaPreset) => Promise<void>;
  onSavePersonaPreset?: (
    preset: PersonaPreset | null,
    data: {
      name: string;
      description: string;
      system_prompt: string;
      tags: string[];
      skill_names: string[];
    },
  ) => Promise<void>;
  onClearPersonaPreset?: () => void;
  canManagePersonaPresets?: boolean;
  agentOptions?: Record<string, AgentOption>;
  agentOptionValues?: Record<string, boolean | string | number>;
  onToggleAgentOption?: (key: string, value: boolean | string | number) => void;
  agents?: { id: string; name: string; description: string }[];
  currentAgent?: string;
  onSelectAgent?: (id: string) => void;
  attachments?: MessageAttachment[];
  onAttachmentsChange?: (
    attachments:
      | MessageAttachment[]
      | ((prev: MessageAttachment[]) => MessageAttachment[]),
  ) => void;
  onMentionQueryChange?: (query: string | null) => void;
  className?: string;
}

export const ChatInput = memo(function ChatInput({
  onSend,
  onStop,
  isLoading,
  disabled,
  canSend = true,
  tools = [],
  onToggleTool,
  onToggleCategory,
  onToggleAll,
  toolsLoading: _toolsLoading,
  enabledToolsCount = 0,
  totalToolsCount = 0,
  skills = [],
  onToggleSkill,
  onToggleSkillCategory,
  onToggleAllSkills,
  skillsLoading: _skillsLoading,
  pendingSkillNames = [],
  skillsMutating = false,
  enabledSkillsCount = 0,
  totalSkillsCount = 0,
  enableSkills = true,
  personaPresets = [],
  personaPresetsTotal,
  personaPresetsPage,
  onPersonaPresetsPageChange,
  onPersonaPresetsSearchChange,
  onPersonaPresetsTagChange,
  selectedPersonaPresetId,
  selectedPersonaName,
  personaSkillsControlled = false,
  personaPresetsLoading = false,
  personaPresetsMutating = false,
  onUsePersonaPreset,
  onCopyPersonaPreset,
  onClearPersonaPreset,
  canManagePersonaPresets = false,
  agentOptions,
  agentOptionValues = {},
  onToggleAgentOption,
  agents = [],
  currentAgent,
  onSelectAgent,
  attachments: externalAttachments,
  onAttachmentsChange: externalOnAttachmentsChange,
  onMentionQueryChange,
  className,
}: ChatInputProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [activePanel, setActivePanel] = useState<FeaturePanel>(null);
  const [internalAttachments, setInternalAttachments] = useState<
    MessageAttachment[]
  >([]);
  const [imageViewerSrc, setImageViewerSrc] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  const [contactAdminOpen, setContactAdminOpen] = useState(false);
  const [helpMenuOpen, setHelpMenuOpen] = useState(false);
  const [shortcutDialogOpen, setShortcutDialogOpen] = useState(false);
  const helpMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!helpMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        helpMenuRef.current &&
        !helpMenuRef.current.contains(e.target as Node)
      ) {
        setHelpMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [helpMenuOpen]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [mentionPopupPlacement, setMentionPopupPlacement] =
    useState<ReturnType<typeof getMentionPopupFixedPlacement>>(null);
  const { hasPermission } = useAuth();

  const uploadCategories = (
    Object.keys(FILE_CATEGORY_PERMISSIONS) as FileCategory[]
  ).filter((cat) => hasPermission(FILE_CATEGORY_PERMISSIONS[cat]));

  const attachments = externalAttachments ?? internalAttachments;
  const setAttachments = externalOnAttachmentsChange ?? setInternalAttachments;

  const { uploadFiles, uploadLimits, validateCount, cancelUpload } =
    useFileUpload({
      attachments,
      onAttachmentsChange: setAttachments,
    });

  const { history, pushHistory, navigateUp, navigateDown } = useInputHistory();

  const { scheduleTextareaResize } = useTextareaResize(textareaRef, input);

  const { handlePaste } = usePasteHandler({
    textareaRef,
    input,
    setInput,
    uploadFiles,
    validateCount,
    scheduleTextareaResize,
  });

  const {
    mention,
    moveHighlight: moveMentionHighlight,
    setHighlightedIndex: setMentionHighlight,
    setResultCount: setMentionResultCount,
    resetMention,
    dismissMention,
  } = useMentionState(input, cursorPosition, !!onUsePersonaPreset);

  const mentionSearch = useMentionSearch(mention.query, mention.isActive);

  useEffect(() => {
    if (mention.isActive) {
      setMentionResultCount(mentionSearch.presets.length);
    }
  }, [mention.isActive, mentionSearch.presets.length, setMentionResultCount]);

  useEffect(() => {
    if (!onMentionQueryChange) return;
    onMentionQueryChange(mention.isActive ? mention.query : null);
  }, [mention.isActive, mention.query, onMentionQueryChange]);

  useEffect(() => {
    if (!onMentionQueryChange || !selectedPersonaPresetId || !mention.isActive)
      return;
    const before = input.substring(0, mention.atIndex);
    const after = input.substring(mention.atIndex + mention.query.length + 1);
    setInput(before + after);
    setCursorPosition(before.length || 0);
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.selectionStart = textarea.selectionEnd = before.length;
        textarea.focus();
        scheduleTextareaResize();
      }
    });
    resetMention();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires only on preset selection
  }, [selectedPersonaPresetId]);

  useEffect(() => {
    const applySelectionActionPrompt = (prompt: string) => {
      setInput((previous) => {
        const next = previous.trim()
          ? `${previous.trim()}\n\n${prompt}`
          : prompt;
        setCursorPosition(next.length);
        requestAnimationFrame(() => {
          const textarea = textareaRef.current;
          if (!textarea) return;
          textarea.focus();
          textarea.selectionStart = textarea.selectionEnd = next.length;
          scheduleTextareaResize();
        });
        return next;
      });
    };

    const pendingPrompt = consumePendingSelectionActionPrompt();
    if (pendingPrompt) {
      applySelectionActionPrompt(pendingPrompt);
    }

    const handleSelectionAction = (event: Event) => {
      const detail = (event as CustomEvent<SelectionActionEventDetail>).detail;
      if (!detail?.prompt) return;
      applySelectionActionPrompt(detail.prompt);
    };

    window.addEventListener(SELECTION_ACTION_EVENT, handleSelectionAction);
    return () => {
      window.removeEventListener(SELECTION_ACTION_EVENT, handleSelectionAction);
    };
  }, [scheduleTextareaResize]);

  useEffect(() => {
    if (!mention.isActive) {
      setMentionPopupPlacement(null);
      return;
    }

    const updateMentionPopupPlacement = () => {
      const container = containerRef.current;
      setMentionPopupPlacement(
        getMentionPopupFixedPlacement({
          inputRect: container?.getBoundingClientRect() ?? null,
          viewportHeight: window.visualViewport?.height ?? window.innerHeight,
        }),
      );
    };

    updateMentionPopupPlacement();
    window.addEventListener("resize", updateMentionPopupPlacement);
    window.addEventListener("scroll", updateMentionPopupPlacement, true);
    window.visualViewport?.addEventListener(
      "resize",
      updateMentionPopupPlacement,
    );
    window.visualViewport?.addEventListener(
      "scroll",
      updateMentionPopupPlacement,
    );
    return () => {
      window.removeEventListener("resize", updateMentionPopupPlacement);
      window.removeEventListener("scroll", updateMentionPopupPlacement, true);
      window.visualViewport?.removeEventListener(
        "resize",
        updateMentionPopupPlacement,
      );
      window.visualViewport?.removeEventListener(
        "scroll",
        updateMentionPopupPlacement,
      );
    };
  }, [mention.isActive]);

  const personaAvatar = useMemo(() => {
    if (!selectedPersonaPresetId) return null;
    const preset = personaPresets.find((p) => p.id === selectedPersonaPresetId);
    if (!preset) return null;
    return {
      avatar: preset.avatar ?? undefined,
      primaryTag: preset.tags[0] || "",
    };
  }, [selectedPersonaPresetId, personaPresets]);

  const applyMentionSelection = useCallback(
    (preset: PersonaPreset) => {
      if (!mention.isActive) return;
      const before = input.substring(0, mention.atIndex);
      const after = input.substring(mention.atIndex + mention.query.length + 1);
      const newInput = before + after;
      setInput(newInput);
      setCursorPosition(before.length || 0);
      requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (textarea) {
          textarea.selectionStart = textarea.selectionEnd = before.length;
          textarea.focus();
          scheduleTextareaResize();
        }
      });
      onUsePersonaPreset?.(preset);
      resetMention();
    },
    [input, mention, onUsePersonaPreset, resetMention, scheduleTextareaResize],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    if (input.trim() && !isLoading && !disabled) {
      const trimmed = input.trim();
      onSend(trimmed, agentOptionValues, attachments);
      pushHistory(trimmed);
      setInput("");
      setAttachments([]);
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto";
        }
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mention.isActive) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        moveMentionHighlight("up");
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveMentionHighlight("down");
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const highlighted = mentionSearch.presets[mention.highlightedIndex];
        if (highlighted) applyMentionSelection(highlighted);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        resetMention();
        return;
      }
    }

    const newlineModifier = localStorage.getItem("newlineModifier") || "shift";

    if (e.key === "Enter") {
      const needsModifier = newlineModifier === "ctrl" ? e.ctrlKey : e.shiftKey;
      if (needsModifier) return;

      e.preventDefault();
      if (isLoading) {
        setStopConfirmOpen(true);
      } else {
        handleSubmit(e);
      }
      return;
    }

    const textarea = textareaRef.current;
    const atTop =
      textarea?.selectionStart === 0 && textarea?.selectionEnd === 0;
    const value = textarea?.value ?? "";
    const atBottom =
      textarea?.selectionStart === value.length &&
      textarea?.selectionEnd === value.length;

    if (e.key === "ArrowUp" && atTop) {
      e.preventDefault();
      const prev = navigateUp(input);
      if (prev !== null) {
        setInput(prev);
        requestAnimationFrame(() => {
          if (textarea) {
            textarea.selectionStart = textarea.selectionEnd = prev.length;
          }
        });
      }
    } else if (e.key === "ArrowDown" && (atBottom || history.length > 0)) {
      e.preventDefault();
      const next = navigateDown();
      if (next !== null) {
        setInput(next);
        requestAnimationFrame(() => {
          if (textarea) {
            textarea.selectionStart = textarea.selectionEnd =
              textarea.value.length;
          }
        });
      }
    }
  };

  const hasContent = !!input.trim() && !disabled;
  const hasUploadingAttachment = attachments.some((a) => a.isUploading);
  const canSubmit =
    hasContent && canSend && !isLoading && !hasUploadingAttachment;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    if (!validateCount(files.length)) return;
    uploadFiles(files);
  };

  const thinkingLabel = agentOptions
    ? Object.entries(agentOptions)
        .filter(([, opt]) => opt.options && opt.options.length > 0)
        .map(([, opt]) => {
          const val =
            agentOptionValues[
              Object.keys(agentOptions).find((k) => agentOptions[k] === opt)!
            ] ?? opt.default;
          const selected = opt.options?.find((o) => o.value === val);
          return selected?.label_key
            ? t(selected.label_key)
            : selected?.label || String(val);
        })[0]
    : undefined;

  const thinkingLevel = agentOptions
    ? Object.entries(agentOptions)
        .filter(([, opt]) => opt.options && opt.options.length > 0)
        .map(([, opt]) => {
          const val =
            agentOptionValues[
              Object.keys(agentOptions).find((k) => agentOptions[k] === opt)!
            ] ?? opt.default;
          return String(val);
        })[0]
    : undefined;

  return (
    <div
      className="chat-input-shell sm:px-4 pb-3"
      style={{ backgroundColor: "var(--theme-bg)" }}
    >
      <form
        onSubmit={handleSubmit}
        className={
          className ?? "mx-auto max-w-3xl lg:max-w-4xl xl:max-w-5xl px-2"
        }
      >
        <div
          ref={containerRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`chat-input-container flex flex-col relative w-full rounded-3xl px-1 border transition-all duration-300 ${
            isDraggingOver ? "border-dashed shadow-lg border-2" : ""
          }`}
          data-mention-active={mention.isActive || undefined}
          style={{
            backgroundColor: "var(--theme-bg-card)",
            borderColor: isDraggingOver
              ? "var(--theme-primary)"
              : "var(--theme-border)",
            boxShadow: isDraggingOver
              ? undefined
              : "0 2px 12px rgba(0,0,0,0.06)",
          }}
        >
          {mention.isActive && !onMentionQueryChange && (
            <MentionPopup
              presets={mentionSearch.presets}
              highlightedIndex={mention.highlightedIndex}
              selectedPresetId={selectedPersonaPresetId}
              isLoading={mentionSearch.isLoading}
              isLoadingMore={mentionSearch.isLoadingMore}
              hasMore={mentionSearch.hasMore}
              onSelect={applyMentionSelection}
              onHover={setMentionHighlight}
              onClose={dismissMention}
              onLoadMore={mentionSearch.loadMore}
              placement={mentionPopupPlacement ?? undefined}
            />
          )}
          {attachments.length > 0 && (
            <div className="mx-3 mt-2.5 -mb-1 flex gap-3 overflow-x-auto attachment-scroll pb-1">
              {attachments.map((attachment) => {
                const isImage =
                  attachment.mimeType?.startsWith("image/") && attachment.url;

                const handleRemove = () => {
                  setAttachments((prev) =>
                    prev.filter((a) => a.id !== attachment.id),
                  );
                  uploadApi.deleteFile(attachment.key).catch((error) => {
                    console.error("Failed to delete file from server:", error);
                  });
                };

                return (
                  <AttachmentCard
                    key={attachment.id}
                    attachment={attachment}
                    variant="editable"
                    size="compact"
                    isUploading={attachment.isUploading}
                    onClick={() => {
                      if (isImage && attachment.url) {
                        setImageViewerSrc(getFullUrl(attachment.url) ?? null);
                      } else {
                        openAttachmentPreview(attachment, "chat-input");
                      }
                    }}
                    onRemove={handleRemove}
                    onCancel={
                      attachment.isUploading
                        ? () => cancelUpload(attachment.id)
                        : undefined
                    }
                  />
                );
              })}
            </div>
          )}

          <div className="px-2.5 pt-1">
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setCursorPosition(e.target.selectionStart);
                }}
                onFocus={scheduleTextareaResize}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={
                  canSend ? t("chat.placeholder") : t("chat.noPermission")
                }
                disabled={disabled || !canSend}
                className="bg-transparent outline-none w-full pt-[10px] resize-none text-[15px] disabled:opacity-50 leading-relaxed overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] min-h-[40px] sm:min-h-[44px]"
                style={{
                  color: "var(--theme-text)",
                  paddingLeft: 4,
                }}
                rows={1}
              />
            </div>
          </div>

          <ChatInputToolbar
            activePanel={activePanel}
            onActivePanelChange={setActivePanel}
            canSend={canSend}
            isLoading={isLoading}
            canSubmit={canSubmit}
            hasUploadingAttachment={hasUploadingAttachment}
            enabledToolsCount={enabledToolsCount}
            totalToolsCount={totalToolsCount}
            enabledSkillsCount={enabledSkillsCount}
            totalSkillsCount={totalSkillsCount}
            hasPersonaSelector={!!onUsePersonaPreset}
            personaName={selectedPersonaName}
            hasAgentSelector={agents.length > 1 && !!onSelectAgent}
            agentName={agents.find((a) => a.id === currentAgent)?.name}
            hasThinkingOption={
              !!(
                agentOptions &&
                onToggleAgentOption &&
                Object.keys(agentOptions).length > 0
              )
            }
            thinkingLabel={thinkingLabel}
            thinkingLevel={thinkingLevel}
            uploadCategories={uploadCategories}
            uploadLimits={uploadLimits}
            uploadFiles={uploadFiles}
            selectedPersonaName={selectedPersonaName}
            personaAvatar={personaAvatar}
            onClearPersonaPreset={onClearPersonaPreset}
            onStopClick={() => setStopConfirmOpen(true)}
            onNoPermissionClick={() => setContactAdminOpen(true)}
          />
        </div>
      </form>

      <ChatInputSelectors
        activePanel={activePanel}
        onActivePanelChange={setActivePanel}
        tools={tools}
        onToggleTool={onToggleTool}
        onToggleCategory={onToggleCategory}
        onToggleAll={onToggleAll}
        enabledToolsCount={enabledToolsCount}
        totalToolsCount={totalToolsCount}
        skills={skills}
        onToggleSkill={onToggleSkill}
        onToggleSkillCategory={onToggleSkillCategory}
        onToggleAllSkills={onToggleAllSkills}
        pendingSkillNames={pendingSkillNames}
        skillsMutating={skillsMutating}
        enabledSkillsCount={enabledSkillsCount}
        totalSkillsCount={totalSkillsCount}
        enableSkills={enableSkills}
        personaSkillsControlled={personaSkillsControlled}
        selectedPersonaName={selectedPersonaName}
        personaPresets={personaPresets}
        personaPresetsTotal={personaPresetsTotal}
        personaPresetsPage={personaPresetsPage}
        onPersonaPresetsPageChange={onPersonaPresetsPageChange}
        onPersonaPresetsSearchChange={onPersonaPresetsSearchChange}
        onPersonaPresetsTagChange={onPersonaPresetsTagChange}
        selectedPersonaPresetId={selectedPersonaPresetId}
        personaPresetsLoading={personaPresetsLoading}
        personaPresetsMutating={personaPresetsMutating}
        onUsePersonaPreset={onUsePersonaPreset}
        onCopyPersonaPreset={onCopyPersonaPreset}
        onClearPersonaPreset={onClearPersonaPreset}
        canManagePersonaPresets={canManagePersonaPresets}
        agents={agents}
        currentAgent={currentAgent}
        onSelectAgent={onSelectAgent}
        agentOptions={agentOptions}
        agentOptionValues={agentOptionValues}
        onToggleAgentOption={onToggleAgentOption}
      />

      {createPortal(
        <div
          ref={helpMenuRef}
          className="hidden sm:block fixed bottom-2 right-2 z-50"
        >
          <button
            type="button"
            aria-label="Help"
            aria-expanded={helpMenuOpen}
            onClick={() => setHelpMenuOpen((v) => !v)}
            className="flex items-center justify-center w-8 h-8 text-sm font-medium rounded-full shadow-md backdrop-blur-sm transition-all duration-200 hover:shadow-lg hover:scale-110 active:scale-95"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--theme-bg-card) 85%, transparent)",
              border: "1px solid var(--theme-border)",
              color: "var(--theme-text-secondary)",
            }}
          >
            <CircleHelp size={16} />
          </button>
          {helpMenuOpen && (
            <div
              role="menu"
              className="absolute bottom-full right-0 mb-2 w-[200px] rounded-xl p-1 shadow-lg"
              style={{
                backgroundColor: "var(--theme-bg-card)",
                border: "1px solid var(--theme-border)",
              }}
            >
              <a
                href="https://yanyutin753.github.io/LambChat/"
                target="_blank"
                rel="noopener noreferrer"
                role="menuitem"
                onClick={() => setHelpMenuOpen(false)}
                className="flex gap-2.5 items-center w-full px-3 py-2 text-[13px] rounded-lg cursor-pointer transition-colors no-underline"
                style={{ color: "var(--theme-text)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor =
                    "var(--theme-bg-hover, rgba(128,128,128,0.08))";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <CircleHelp
                  size={16}
                  className="shrink-0"
                  style={{ color: "var(--theme-text-secondary)" }}
                />
                <span className="flex-1">{t("chat.helpDocs", "帮助文档")}</span>
                <ExternalLink
                  size={12}
                  style={{ color: "var(--theme-text-secondary)", opacity: 0.5 }}
                />
              </a>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setHelpMenuOpen(false);
                  setShortcutDialogOpen(true);
                }}
                className="flex gap-2.5 items-center w-full px-3 py-2 text-[13px] rounded-lg cursor-pointer transition-colors"
                style={{ color: "var(--theme-text)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor =
                    "var(--theme-bg-hover, rgba(128,128,128,0.08))";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <Keyboard
                  size={16}
                  className="shrink-0"
                  style={{ color: "var(--theme-text-secondary)" }}
                />
                <span>{t("chat.keyboardShortcuts", "键盘快捷键")}</span>
              </button>
            </div>
          )}
          {shortcutDialogOpen && (
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center"
              onClick={() => setShortcutDialogOpen(false)}
            >
              <div
                className="absolute inset-0"
                style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
              />
              <div
                className="relative w-full max-w-md mx-4 rounded-2xl p-5 shadow-xl"
                style={{
                  backgroundColor: "var(--theme-bg-card)",
                  border: "1px solid var(--theme-border)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3
                    className="text-base font-semibold"
                    style={{ color: "var(--theme-text)" }}
                  >
                    {t("chat.keyboardShortcuts", "键盘快捷键")}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShortcutDialogOpen(false)}
                    className="p-1 rounded-lg transition-colors cursor-pointer"
                    style={{ color: "var(--theme-text-secondary)" }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor =
                        "var(--theme-bg-hover, rgba(128,128,128,0.08))";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
                <div
                  className="space-y-3 text-[13px]"
                  style={{ color: "var(--theme-text-secondary)" }}
                >
                  <div
                    className="pb-2 mb-1 text-[11px] font-medium uppercase tracking-wider"
                    style={{
                      color: "var(--theme-text-secondary)",
                      opacity: 0.5,
                    }}
                  >
                    {t("shortcut.categoryChat", "对话")}
                  </div>
                  <ShortcutRow
                    label={t("shortcut.send", "发送消息")}
                    keys={["Enter"]}
                  />
                  <ShortcutRow
                    label={t("shortcut.newline", "换行")}
                    keys={
                      localStorage.getItem("newlineModifier") === "ctrl"
                        ? ["Ctrl", "Enter"]
                        : ["Shift", "Enter"]
                    }
                  />
                  <ShortcutRow
                    label={t("shortcut.historyUp", "上一条历史")}
                    keys={["↑"]}
                  />
                  <ShortcutRow
                    label={t("shortcut.historyDown", "下一条历史")}
                    keys={["↓"]}
                  />
                  <div
                    className="pt-2 pb-2 mt-1 text-[11px] font-medium uppercase tracking-wider"
                    style={{
                      color: "var(--theme-text-secondary)",
                      opacity: 0.5,
                    }}
                  >
                    {t("shortcut.categoryGeneral", "通用")}
                  </div>
                  <ShortcutRow
                    label={t("shortcut.newChat", "新建对话")}
                    keys={["Ctrl", "N"]}
                    macKeys={["⌘", "N"]}
                  />
                  <ShortcutRow
                    label={t("shortcut.newChatAlt", "新建对话 (备选)")}
                    keys={["Ctrl", "Shift", "O"]}
                    macKeys={["⌘", "Shift", "O"]}
                  />
                  <ShortcutRow
                    label={t("shortcut.search", "搜索对话")}
                    keys={["Ctrl", "K"]}
                    macKeys={["⌘", "K"]}
                  />
                  <ShortcutRow
                    label={t("shortcut.selectPersona", "选择角色")}
                    keys={["@"]}
                  />
                  <div
                    className="pt-2 pb-2 mt-1 text-[11px] font-medium uppercase tracking-wider"
                    style={{
                      color: "var(--theme-text-secondary)",
                      opacity: 0.5,
                    }}
                  >
                    {t("shortcut.categoryDialog", "弹窗")}
                  </div>
                  <ShortcutRow
                    label={t("shortcut.closeDialog", "关闭弹窗")}
                    keys={["Esc"]}
                  />
                  <ShortcutRow
                    label={t("shortcut.confirm", "确认提交")}
                    keys={["Ctrl", "Enter"]}
                    macKeys={["⌘", "Enter"]}
                  />
                </div>
              </div>
            </div>
          )}
        </div>,
        document.body,
      )}

      {imageViewerSrc && (
        <ImageViewer
          src={imageViewerSrc}
          isOpen={!!imageViewerSrc}
          onClose={() => setImageViewerSrc(null)}
        />
      )}

      <ConfirmDialog
        isOpen={stopConfirmOpen}
        title={t("chat.stopConfirmTitle")}
        message={t("chat.stopConfirmMessage")}
        confirmText={t("chat.stop")}
        cancelText={t("common.cancel")}
        variant="warning"
        onConfirm={() => {
          setStopConfirmOpen(false);
          onStop();
          toast.custom(() => (
            <div
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
              style={{
                background:
                  "color-mix(in srgb, var(--theme-primary) 10%, transparent)",
                border:
                  "1px solid color-mix(in srgb, var(--theme-primary) 20%, transparent)",
                color: "var(--theme-primary)",
              }}
            >
              <Ban size={16} className="shrink-0" />
              <span>{t("chat.status.cancelled")}</span>
            </div>
          ));
        }}
        onCancel={() => setStopConfirmOpen(false)}
      />

      <ContactAdminDialog
        isOpen={contactAdminOpen}
        onClose={() => setContactAdminOpen(false)}
        reason="noPermission"
      />
    </div>
  );
});
