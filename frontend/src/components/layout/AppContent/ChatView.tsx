import { useMemo, useCallback, useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ListTree } from "lucide-react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../hooks/useAuth";
import { ChatMessage } from "../../chat/ChatMessage";
import { AttachmentPreviewHost } from "../../chat/AttachmentPreviewHost";
import { RevealPreviewHost } from "../../chat/ChatMessage/items/RevealPreviewHost";
import { SessionImageGalleryProvider } from "../../chat/ChatMessage/sessionImageGallery";
import {
  PersistentToolPanelHost,
  closePersistentToolPanel,
  openPersistentToolPanel,
  isPersistentToolPanelOpen,
  updatePersistentToolPanel,
  type PersistentToolPanelState,
} from "../../chat/ChatMessage/items/persistentToolPanelState";
import { ChatInput } from "../../chat/ChatInput";
import { WelcomePage } from "../../chat/WelcomePage";
import { Virtuoso, type ListRange } from "react-virtuoso";
import { ApprovalPanel } from "../../panels/ApprovalPanel";
import {
  ChatSkeleton,
  ChatSkeletonMessagesOnly,
} from "../../skeletons/ChatSkeletons";
import { useMessageScroll } from "./useMessageScroll";
import {
  getAtBottomThresholdPx,
  getInitialBottomItemLocation,
  getMessageListFooterSpacerClass,
} from "./messageScrollUtils";
import { getNextMessageListSessionKey } from "./useMessageScroll";
import {
  createMessageAnchorId,
  getOutlineActiveAnchorIdForRange,
  shouldShowMessageOutline,
  extractMessageOutline,
} from "./messageOutline";
import { MessageOutlinePanel } from "./MessageOutlinePanel";
import {
  isSessionRunning,
  shouldShowStreamingFooterSkeleton,
} from "./sessionState";
import type {
  Message,
  PendingApproval,
  ToolState,
  SkillResponse,
  SkillSource,
  ToolCategory,
  AgentOption,
  AgentInfo,
  MessageAttachment,
  ConnectionStatus,
  PersonaPreset,
  PersonaPresetSnapshot,
} from "../../../types";
import type { RevealPreviewRequest } from "../../chat/ChatMessage/items/revealPreviewData";
import { clearFileRevealAutoOpenState } from "../../chat/ChatMessage/items/fileRevealAutoOpen";
import { clearProjectRevealAutoOpenState } from "../../chat/ChatMessage/items/projectRevealAutoOpen";
import { getLatestChatAutoPreviewTarget } from "../../chat/ChatMessage/autoPreviewEligibility";
import { findCancelledRetryTarget } from "../../chat/ChatMessage/cancelledRetry";
import {
  createActiveRevealPreviewState,
  markRevealPreviewInteracted,
  shouldAcceptRevealPreviewOpen,
  shouldStabilizeScrollForAutoPreviewOpen,
  type ActiveRevealPreviewState,
  type RevealPreviewOpenSource,
} from "../../chat/ChatMessage/items/revealPreviewState";
import {
  getActiveRevealPreviewState,
  setActiveRevealPreviewState,
  subscribeActiveRevealPreviewState,
  updateActiveRevealPreviewState,
} from "../../chat/ChatMessage/items/activeRevealPreviewStore";
import { clearSidebarHistory } from "../../chat/ChatMessage/items/sidebarHistoryStore";
import type { ExternalNavigationTargetFile } from "./externalNavigationState";
import { isFileLink } from "../../documents/utils";
import { getFullUrl } from "../../../services/api/config";
import { sessionApi } from "../../../services/api";
import { teamApi } from "../../../services/api/team";
import type { Team } from "../../../types/team";
import { getTeamFallbackAvatar } from "../../team/teamAvatarUtils";
import { shouldOpenExternalNavigationPreview } from "./externalNavigationState";

function useCurrentTeam(currentAgent: string, selectedTeamId: string | null) {
  const [currentTeam, setCurrentTeam] = useState<Team | null>(null);

  useEffect(() => {
    if (currentAgent !== "team" || !selectedTeamId) {
      setCurrentTeam(null);
      return;
    }

    let cancelled = false;
    teamApi
      .get(selectedTeamId)
      .then((team) => {
        if (!cancelled) setCurrentTeam(team);
      })
      .catch(() => {
        if (!cancelled) setCurrentTeam(null);
      });

    return () => {
      cancelled = true;
    };
  }, [currentAgent, selectedTeamId]);

  return currentTeam;
}

function resolveChatAssistantIdentity({
  currentAgent,
  currentPersonaAvatar,
  currentTeam,
  selectedPersonaName,
}: {
  currentAgent: string;
  currentPersonaAvatar: string | null;
  currentTeam: Team | null;
  selectedPersonaName: string | null;
}) {
  if (currentAgent === "team") {
    const fallbackAvatar = currentTeam
      ? getTeamFallbackAvatar(currentTeam)
      : null;
    return {
      avatar: currentTeam?.avatar ?? fallbackAvatar,
      name: currentTeam?.name ?? null,
    };
  }

  return {
    avatar: currentPersonaAvatar,
    name: selectedPersonaName,
  };
}

interface ChatViewProps {
  messages: Message[];
  sessionId: string | null;
  currentRunId: string | null;
  isLoading: boolean;
  isLoadingHistory: boolean;
  connectionStatus?: ConnectionStatus;
  canSendMessage: boolean;
  tools: ToolState[];
  onToggleTool: (name: string) => void;
  onToggleCategory: (category: ToolCategory, enabled: boolean) => void;
  onToggleAll: (enabled: boolean) => void;
  toolsLoading: boolean;
  enabledToolsCount: number;
  totalToolsCount: number;
  skills: SkillResponse[];
  onToggleSkill: (name: string) => Promise<boolean>;
  onToggleSkillCategory: (
    category: SkillSource,
    enabled: boolean,
  ) => Promise<boolean>;
  onToggleAllSkills: (enabled: boolean) => Promise<boolean>;
  skillsLoading: boolean;
  pendingSkillNames: string[];
  skillsMutating: boolean;
  enabledSkillsCount: number;
  totalSkillsCount: number;
  enableSkills: boolean;
  personaPresets: PersonaPreset[];
  personaPresetsTotal: number;
  hasMorePersonaPresets: boolean;
  isLoadingMorePersonaPresets: boolean;
  onLoadMorePersonaPresets: () => void;
  personaPresetsPage: number;
  onPersonaPresetsPageChange: (page: number) => void;
  onPersonaPresetsSearchChange: (query: string) => void;
  onPersonaPresetsTagChange: (tag: string | null) => void;
  selectedPersonaPresetId: string | null;
  selectedPersonaName: string | null;
  selectedPersonaSnapshot: PersonaPresetSnapshot | null;
  personaSkillsControlled: boolean;
  personaPresetsLoading: boolean;
  personaPresetsMutating: boolean;
  onUsePersonaPreset: (
    preset: PersonaPreset,
  ) => Promise<PersonaPresetSnapshot | null>;
  onTogglePersonaPreference: (
    preset: PersonaPreset,
    preference: { is_favorite?: boolean; is_pinned?: boolean },
  ) => Promise<void>;
  onCopyPersonaPreset: (preset: PersonaPreset) => Promise<void>;
  onSavePersonaPreset: (
    preset: PersonaPreset | null,
    data: {
      name: string;
      description: string;
      system_prompt: string;
      tags: string[];
      skill_names: string[];
    },
  ) => Promise<void>;
  onClearPersonaPreset: () => void;
  canManagePersonaPresets: boolean;
  agentOptions: Record<string, AgentOption>;
  agentOptionValues: Record<string, boolean | string | number>;
  onToggleAgentOption: (key: string, value: boolean | string | number) => void;
  // Agent mode selector
  agents: AgentInfo[];
  currentAgent: string;
  onSelectAgent: (id: string) => void;
  // Team picker
  selectedTeamId: string | null;
  onSelectTeam: (teamId: string | null) => void;
  onOpenTeamBuilder?: () => void;
  approvals: PendingApproval[];
  onRespondApproval: (
    id: string,
    response: Record<string, unknown>,
    approved: boolean,
  ) => void;
  approvalLoading: boolean;
  onSendMessage: (content: string, attachments?: MessageAttachment[]) => void;
  onStopGeneration: () => void;
  attachments: MessageAttachment[];
  onAttachmentsChange: React.Dispatch<
    React.SetStateAction<MessageAttachment[]>
  >;
  externalNavigationToken?: string | null;
  externalNavigationTargetFile?: ExternalNavigationTargetFile | null;
  externalNavigationPreview?: RevealPreviewRequest | null;
  externalNavigationTargetRunId?: string | null;
  externalNavigationTargetRunPending?: boolean;
  externalScrollToBottom?: boolean;
  outlineToggleRef?: React.RefObject<(() => void) | null>;
}

export function ChatView({
  messages,
  sessionId,
  currentRunId,
  isLoading,
  isLoadingHistory,
  connectionStatus,
  canSendMessage,
  tools,
  onToggleTool,
  onToggleCategory,
  onToggleAll,
  toolsLoading,
  enabledToolsCount,
  totalToolsCount,
  skills,
  onToggleSkill,
  onToggleSkillCategory,
  onToggleAllSkills,
  skillsLoading,
  pendingSkillNames,
  skillsMutating,
  enabledSkillsCount,
  totalSkillsCount,
  enableSkills,
  personaPresets,
  personaPresetsTotal,
  hasMorePersonaPresets,
  isLoadingMorePersonaPresets,
  onLoadMorePersonaPresets,
  personaPresetsPage,
  onPersonaPresetsPageChange,
  onPersonaPresetsSearchChange,
  onPersonaPresetsTagChange,
  selectedPersonaPresetId,
  selectedPersonaName,
  selectedPersonaSnapshot,
  personaSkillsControlled,
  personaPresetsLoading,
  personaPresetsMutating,
  onUsePersonaPreset,
  onTogglePersonaPreference,
  onCopyPersonaPreset,
  onSavePersonaPreset,
  onClearPersonaPreset,
  canManagePersonaPresets,
  agentOptions,
  agentOptionValues,
  onToggleAgentOption,
  agents,
  currentAgent,
  onSelectAgent,
  selectedTeamId,
  onSelectTeam,
  onOpenTeamBuilder,
  approvals,
  onRespondApproval,
  approvalLoading,
  onSendMessage,
  onStopGeneration,
  attachments,
  onAttachmentsChange,
  externalNavigationToken,
  externalNavigationTargetFile,
  externalNavigationPreview,
  externalNavigationTargetRunId,
  externalNavigationTargetRunPending,
  externalScrollToBottom,
  outlineToggleRef,
}: ChatViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const sessionRunning = isSessionRunning(messages, isLoading);
  const hasVisibleStreamingMessage = messages.some(
    (message) => message.role === "assistant" && message.isStreaming,
  );

  const showStreamingFooterSkeleton = shouldShowStreamingFooterSkeleton({
    connectionStatus,
    sessionRunning,
    messageCount: messages.length,
    hasVisibleStreamingMessage,
  });

  const getGreetingKey = () => {
    const h = new Date().getHours();
    if (h < 6) return "chat.goodEvening";
    if (h < 12) return "chat.goodMorning";
    if (h < 18) return "chat.goodAfternoon";
    return "chat.goodEvening";
  };
  const greeting = user?.username
    ? t(getGreetingKey(), { name: user.username })
    : t(getGreetingKey());

  const showOutline = shouldShowMessageOutline(messages);
  const outlineItems = useMemo(
    () => (showOutline ? extractMessageOutline(messages) : []),
    [messages, showOutline],
  );
  const previousSessionIdRef = useRef<string | null | undefined>(sessionId);
  const [messageListSessionKey, setMessageListSessionKey] = useState(
    sessionId ?? "__new_session__",
  );

  const {
    messagesContainerRef,
    virtuosoRef,
    virtuosoScrollerRef,
    messagesEndRef,
    isNearBottom,
    isNearTop,
    handleVirtuosoAtBottomChange,
    scrollToBottom,
    scrollToTop,
  } = useMessageScroll(
    messages,
    sessionId,
    externalNavigationToken,
    externalNavigationTargetFile,
    externalNavigationTargetRunId,
    externalNavigationTargetRunPending,
    externalScrollToBottom,
    isLoadingHistory,
    messageListSessionKey,
  );
  const [visibleRange, setVisibleRange] = useState<ListRange | null>(null);

  useEffect(() => {
    const previousSessionId = previousSessionIdRef.current;
    previousSessionIdRef.current = sessionId;
    setMessageListSessionKey((previousKey) => {
      const nextKey = getNextMessageListSessionKey({
        previousSessionId,
        sessionId,
        messageCount: messages.length,
        previousKey,
      });
      return nextKey === previousKey ? previousKey : nextKey;
    });
  }, [messages.length, sessionId]);

  const activeOutlineId = useMemo(() => {
    const rangeActiveId = getOutlineActiveAnchorIdForRange(
      messages,
      visibleRange,
    );
    if (rangeActiveId) {
      return rangeActiveId;
    }

    const latestMessage = messages[messages.length - 1];
    return latestMessage ? createMessageAnchorId(latestMessage.id) : null;
  }, [messages, visibleRange]);

  const currentPersonaAvatar = useMemo(() => {
    const preset = personaPresets.find((p) => p.id === selectedPersonaPresetId);
    return preset?.avatar ?? null;
  }, [personaPresets, selectedPersonaPresetId]);
  const currentTeam = useCurrentTeam(currentAgent, selectedTeamId);
  const assistantIdentity = useMemo(
    () =>
      resolveChatAssistantIdentity({
        currentAgent,
        currentPersonaAvatar,
        currentTeam,
        selectedPersonaName,
      }),
    [currentAgent, currentPersonaAvatar, currentTeam, selectedPersonaName],
  );

  const handleOutlineNavigate = useCallback(
    (anchorId: string, messageIndex: number) => {
      virtuosoRef.current?.scrollToIndex({
        index: messageIndex,
        behavior: "smooth",
        align: "start",
      });
      // After Virtuoso renders the message, scroll to the specific heading anchor
      requestAnimationFrame(() => {
        const el = document.getElementById(anchorId);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
      requestAnimationFrame(() => {
        closePersistentToolPanel();
      });
    },
    [virtuosoRef],
  );

  const handleOpenOutline = useCallback(() => {
    if (isPersistentToolPanelOpen("outline")) {
      closePersistentToolPanel();
      return;
    }
    const isMobile = window.innerWidth < 640;
    openPersistentToolPanel({
      title: t("chat.outline"),
      icon: <ListTree size={18} strokeWidth={2} />,
      status: "idle",
      panelKey: "outline",
      viewMode: isMobile ? "center" : "sidebar",
      children: (
        <MessageOutlinePanel
          items={outlineItems}
          activeId={activeOutlineId}
          onNavigate={handleOutlineNavigate}
          personaAvatar={assistantIdentity.avatar}
        />
      ),
    });
  }, [
    outlineItems,
    activeOutlineId,
    handleOutlineNavigate,
    t,
    assistantIdentity.avatar,
  ]);

  useEffect(() => {
    if (outlineToggleRef) {
      outlineToggleRef.current = showOutline ? handleOpenOutline : null;
    }
  }, [outlineToggleRef, showOutline, handleOpenOutline]);

  useEffect(() => {
    if (!isPersistentToolPanelOpen("outline")) return;
    updatePersistentToolPanel(
      (prev: PersistentToolPanelState) => ({
        ...prev,
        children: (
          <MessageOutlinePanel
            items={outlineItems}
            activeId={activeOutlineId}
            onNavigate={handleOutlineNavigate}
          />
        ),
      }),
      "outline",
    );
  }, [outlineItems, activeOutlineId, handleOutlineNavigate]);

  const [, forcePreviewRender] = useState(0);
  const activePreviewStateRef = useRef<ActiveRevealPreviewState | null>(
    getActiveRevealPreviewState(),
  );
  const isNearBottomRef = useRef(isNearBottom);
  const autoPreviewScrollStabilizerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const dismissedPreviewKeysRef = useRef<Set<string>>(new Set());
  const handledExternalPreviewRef = useRef<{
    token: string | null;
    sessionId: string | null;
  }>({
    token: null,
    sessionId: null,
  });
  const externalPreviewActiveRef = useRef(false);
  const activePreview = activePreviewStateRef.current?.request ?? null;

  useEffect(() => {
    isNearBottomRef.current = isNearBottom;
  }, [isNearBottom]);

  useEffect(() => {
    const syncPreviewState = () => {
      const previousPreview = activePreviewStateRef.current;
      const nextPreview = getActiveRevealPreviewState();
      activePreviewStateRef.current = nextPreview;
      forcePreviewRender((count) => count + 1);

      if (
        shouldStabilizeScrollForAutoPreviewOpen({
          previousPreview,
          nextPreview,
          isNearBottom: isNearBottomRef.current,
        })
      ) {
        if (autoPreviewScrollStabilizerRef.current) {
          clearTimeout(autoPreviewScrollStabilizerRef.current);
        }
        autoPreviewScrollStabilizerRef.current = setTimeout(() => {
          autoPreviewScrollStabilizerRef.current = null;
          scrollToBottom();
        }, 360);
      }
    };

    const unsubscribe = subscribeActiveRevealPreviewState(syncPreviewState);
    return () => {
      unsubscribe();
      if (autoPreviewScrollStabilizerRef.current) {
        clearTimeout(autoPreviewScrollStabilizerRef.current);
        autoPreviewScrollStabilizerRef.current = null;
      }
    };
  }, [scrollToBottom]);

  const handleOpenPreview = useCallback(
    (
      preview: RevealPreviewRequest,
      source: RevealPreviewOpenSource = "manual",
    ) => {
      // Block auto-open when an external navigation preview is active
      if (source === "auto" && externalPreviewActiveRef.current) {
        return false;
      }

      const shouldOpen = shouldAcceptRevealPreviewOpen({
        activePreview: activePreviewStateRef.current,
        nextPreview: preview,
        source,
        dismissedPreviewKeys: dismissedPreviewKeysRef.current,
      });

      if (!shouldOpen) {
        return false;
      }

      if (source !== "auto") {
        dismissedPreviewKeysRef.current.delete(preview.previewKey);
      }

      setActiveRevealPreviewState(
        createActiveRevealPreviewState(preview, source),
      );
      return true;
    },
    [],
  );

  const handleClosePreview = useCallback((dismiss = true) => {
    const currentPreview = activePreviewStateRef.current;
    if (dismiss && currentPreview) {
      dismissedPreviewKeysRef.current.add(currentPreview.request.previewKey);
    }
    externalPreviewActiveRef.current = false;
    setActiveRevealPreviewState(null);
  }, []);

  const handlePreviewInteraction = useCallback(() => {
    updateActiveRevealPreviewState((current) =>
      markRevealPreviewInteracted(current),
    );
  }, []);

  // Fallback: intercept file links anywhere in the chat area (covers MCP blocks, subagent panels, etc.)
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("a[href]");
      if (!target) return;
      const href = (target as HTMLAnchorElement).getAttribute("href");
      if (!href) return;

      const fileLinkInfo = isFileLink(href);
      if (!fileLinkInfo.isFile) return;

      e.preventDefault();
      e.stopPropagation();

      const fullUrl = getFullUrl(href) || href;
      setActiveRevealPreviewState(
        createActiveRevealPreviewState(
          {
            kind: "file",
            previewKey: fullUrl,
            filePath: fileLinkInfo.fileName,
            signedUrl: fullUrl,
          },
          "manual",
        ),
      );
    };

    container.addEventListener("click", handleClick, true);
    return () => container.removeEventListener("click", handleClick, true);
  }, [messagesContainerRef]);

  useEffect(() => {
    dismissedPreviewKeysRef.current.clear();
    clearFileRevealAutoOpenState();
    clearProjectRevealAutoOpenState();
    clearSidebarHistory();
    setActiveRevealPreviewState(null);
    externalPreviewActiveRef.current = false;
    closePersistentToolPanel();
  }, [sessionId]);

  useEffect(() => {
    if (
      !shouldOpenExternalNavigationPreview({
        externalNavigationToken,
        externalNavigationPreview,
        handledToken: handledExternalPreviewRef.current.token,
        handledSessionId: handledExternalPreviewRef.current.sessionId,
        sessionId,
      })
    ) {
      return;
    }

    if (typeof window !== "undefined" && window.innerWidth < 640) {
      return;
    }

    if (!externalNavigationToken || !externalNavigationPreview) {
      return;
    }

    const opened = handleOpenPreview(externalNavigationPreview, "external");
    if (!opened) {
      return;
    }

    handledExternalPreviewRef.current = {
      token: externalNavigationToken,
      sessionId: sessionId ?? null,
    };
    externalPreviewActiveRef.current = true;
  }, [
    externalNavigationToken,
    externalNavigationPreview,
    handleOpenPreview,
    sessionId,
  ]);

  const latestAutoPreview = useMemo(
    () =>
      getLatestChatAutoPreviewTarget({
        messages,
        suppressAutoPreview: !!externalNavigationPreview,
      }),
    [messages, externalNavigationPreview],
  );
  const isMobileViewport =
    typeof window !== "undefined" ? window.innerWidth < 640 : false;

  const handleForkMessage = useCallback(
    async (messageId: string) => {
      if (!sessionId) return;
      try {
        const response = await sessionApi.forkMessage(sessionId, messageId);
        toast.success(t("chat.message.forkSuccess"));
        navigate(`/chat/${response.session.id}`);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t("chat.message.forkFailed"),
        );
      }
    },
    [navigate, sessionId, t],
  );

  const handleRetryCancelledMessage = useCallback(
    (messageId: string) => {
      if (sessionRunning || !canSendMessage) {
        return;
      }

      const target = findCancelledRetryTarget(messages, messageId);
      if (!target) {
        return;
      }

      onSendMessage(target.content, target.attachments);
    },
    [canSendMessage, messages, onSendMessage, sessionRunning],
  );

  const handleRecommendQuestionClick = useCallback(
    (question: string) => {
      if (sessionRunning || !canSendMessage) {
        return;
      }
      onSendMessage(question);
    },
    [canSendMessage, onSendMessage, sessionRunning],
  );

  const handleVirtuosoRangeChanged = useCallback((range: ListRange) => {
    setVisibleRange((current) =>
      current?.startIndex === range.startIndex &&
      current?.endIndex === range.endIndex
        ? current
        : range,
    );
  }, []);

  const virtuosoComponents = useMemo(
    () => ({
      Scroller: (
        scrollerProps: React.HTMLAttributes<HTMLDivElement> & {
          children?: React.ReactNode;
          ref?: React.Ref<HTMLDivElement>;
        },
      ) => {
        const { children, ref: vRef, ...props } = scrollerProps;
        return (
          <div
            {...props}
            ref={(el: HTMLDivElement | null) => {
              virtuosoScrollerRef.current = el;
              if (typeof vRef === "function") vRef(el);
              else if (vRef)
                (
                  vRef as React.MutableRefObject<HTMLDivElement | null>
                ).current = el;
            }}
          >
            {children}
          </div>
        );
      },
      Footer: () => (
        <>
          {showStreamingFooterSkeleton && (
            <div className="pb-4">
              <ChatSkeletonMessagesOnly count={3} />
            </div>
          )}
          <div
            ref={messagesEndRef}
            className={getMessageListFooterSpacerClass(isMobileViewport)}
          />
        </>
      ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showStreamingFooterSkeleton],
  );

  const virtuosoItemContent = useCallback(
    (index: number, message: (typeof messages)[number]) => (
      <ChatMessage
        message={message}
        sessionId={sessionId ?? undefined}
        runId={currentRunId ?? undefined}
        isLastMessage={index === messages.length - 1}
        personaAvatar={assistantIdentity.avatar}
        personaName={assistantIdentity.name}
        activePreview={activePreview}
        latestAutoPreview={latestAutoPreview}
        onOpenPreview={handleOpenPreview}
        onForkMessage={handleForkMessage}
        onRecommendQuestionClick={handleRecommendQuestionClick}
        onRetryCancelledMessage={handleRetryCancelledMessage}
      />
    ),
    [
      sessionId,
      currentRunId,
      messages.length,
      assistantIdentity.avatar,
      assistantIdentity.name,
      activePreview,
      latestAutoPreview,
      handleOpenPreview,
      handleForkMessage,
      handleRecommendQuestionClick,
      handleRetryCancelledMessage,
    ],
  );

  // Shared ChatInput props to avoid duplication
  const chatInputProps = {
    onSend: (
      content: string,
      _options?: Record<string, boolean | string | number>,
      sendAttachments?: MessageAttachment[],
    ) => onSendMessage(content, sendAttachments),
    onStop: onStopGeneration,
    isLoading: sessionRunning,
    canSend: canSendMessage,
    tools,
    onToggleTool,
    onToggleCategory,
    onToggleAll,
    toolsLoading,
    enabledToolsCount,
    totalToolsCount,
    skills,
    onToggleSkill,
    onToggleSkillCategory,
    onToggleAllSkills,
    skillsLoading,
    pendingSkillNames,
    skillsMutating,
    enabledSkillsCount,
    totalSkillsCount,
    enableSkills,
    personaPresets,
    personaPresetsTotal,
    personaPresetsPage,
    onPersonaPresetsPageChange,
    onPersonaPresetsSearchChange,
    onPersonaPresetsTagChange,
    selectedPersonaPresetId,
    selectedPersonaName,
    personaSkillsControlled,
    personaPresetsLoading,
    personaPresetsMutating,
    onUsePersonaPreset,
    onTogglePersonaPreference,
    onCopyPersonaPreset,
    onSavePersonaPreset,
    onClearPersonaPreset,
    canManagePersonaPresets,
    agentOptions,
    agentOptionValues,
    onToggleAgentOption,
    agents,
    currentAgent,
    onSelectAgent,
    selectedTeamId,
    onSelectTeam,
    onOpenTeamBuilder,
    attachments,
    onAttachmentsChange,
  };

  return (
    <SessionImageGalleryProvider messages={messages}>
      <main
        ref={messagesContainerRef}
        className={`relative flex-1 min-h-0 mt-4 ${
          messages.length > 0 ? "overflow-hidden" : ""
        }`}
      >
        {messages.length === 0 ? (
          isLoading ? (
            <ChatSkeleton count={5} />
          ) : (
            <WelcomePage
              greeting={greeting}
              subtitle={
                t("chat.welcomeSubtitle") ?? "How can I help you today?"
              }
              refreshLabel={t("chat.welcomeRefresh") ?? "Refresh"}
              personasLabel={t("personaPresets.title", "角色")}
              starterPromptsLabel={t(
                "personaPresets.starterPrompts",
                "开始对话",
              )}
              changePersonaLabel={t("personaPresets.change", "更换角色")}
              personaPresets={personaPresets}
              hasMorePersonaPresets={hasMorePersonaPresets}
              isLoadingMorePersonaPresets={isLoadingMorePersonaPresets}
              onLoadMorePersonaPresets={onLoadMorePersonaPresets}
              selectedPersonaPresetId={selectedPersonaPresetId}
              selectedPersonaSnapshot={selectedPersonaSnapshot}
              personaPresetsLoading={personaPresetsLoading}
              personaPresetsMutating={personaPresetsMutating}
              currentAgent={currentAgent}
              selectedTeamId={selectedTeamId}
              canSendMessage={canSendMessage}
              chatInputProps={chatInputProps}
              onUsePersonaPreset={onUsePersonaPreset}
              onClearPersonaPreset={onClearPersonaPreset}
              onSelectTeam={onSelectTeam}
            />
          )
        ) : (
          <Virtuoso
            key={messageListSessionKey}
            ref={virtuosoRef}
            className="dark:divide-stone-800 overflow-x-hidden"
            data={messages}
            computeItemKey={(_, message) => message.id}
            atBottomStateChange={handleVirtuosoAtBottomChange}
            atBottomThreshold={getAtBottomThresholdPx(isMobileViewport)}
            followOutput={"smooth"}
            rangeChanged={handleVirtuosoRangeChanged}
            components={virtuosoComponents}
            itemContent={virtuosoItemContent}
            initialTopMostItemIndex={getInitialBottomItemLocation(
              messages.length,
            )}
          />
        )}
      </main>

      <ApprovalPanel
        approvals={approvals}
        onRespond={onRespondApproval}
        isLoading={approvalLoading}
      />

      <RevealPreviewHost
        preview={activePreview}
        onClose={() => handleClosePreview(true)}
        onUserInteraction={handlePreviewInteraction}
      />
      <AttachmentPreviewHost />
      <PersistentToolPanelHost />

      {/* Floating scroll buttons - fixed bottom-right */}
      {messages.length > 0 && (
        <div className="bottom-40 sm:bottom-44 z-50 fixed right-3 sm:right-5 flex flex-col gap-2">
          <button
            onClick={scrollToTop}
            className="group/btn relative flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[var(--theme-bg-card)]/90 dark:bg-[var(--theme-bg-card)]/80 border border-[var(--theme-border)] shadow-[0_2px_8px_-2px_rgb(0_0_0/0.08),0_4px_16px_-4px_rgb(0_0_0/0.04)] dark:shadow-[0_2px_8px_-2px_rgb(0_0_0/0.3),0_4px_16px_-4px_rgb(0_0_0/0.2)] hover:shadow-[0_4px_12px_-2px_rgb(0_0_0/0.12),0_8px_24px_-4px_rgb(0_0_0/0.08)] dark:hover:shadow-[0_4px_12px_-2px_rgb(0_0_0/0.4),0_8px_24px_-4px_rgb(0_0_0/0.3)] hover:-translate-y-0.5 transition-all duration-300 active:scale-95"
            style={{
              opacity: isNearTop ? 0 : 1,
              transform: isNearTop ? "translateY(6px)" : "translateY(0)",
              pointerEvents: isNearTop ? "none" : "auto",
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4 sm:w-[18px] sm:h-[18px] text-[var(--theme-text-tertiary)] group-hover/btn:text-[var(--theme-text-secondary)] transition-colors duration-200"
            >
              <path
                fillRule="evenodd"
                d="M10 17a.75.75 0 01-.75-.75V5.612l-3.96 4.158a.75.75 0 11-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <button
            onClick={scrollToBottom}
            className={`group/btn relative flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[var(--theme-bg-card)]/90 dark:bg-[var(--theme-bg-card)]/80 border border-[var(--theme-border)] shadow-[0_2px_8px_-2px_rgb(0_0_0/0.08),0_4px_16px_-4px_rgb(0_0_0/0.04)] dark:shadow-[0_2px_8px_-2px_rgb(0_0_0/0.3),0_4px_16px_-4px_rgb(0_0_0/0.2)] hover:shadow-[0_4px_12px_-2px_rgb(0_0_0/0.12),0_8px_24px_-4px_rgb(0_0_0/0.08)] dark:hover:shadow-[0_4px_12px_-2px_rgb(0_0_0/0.4),0_8px_24px_-4px_rgb(0_0_0/0.3)] hover:-translate-y-0.5 transition-all duration-300 active:scale-95 ${
              hasVisibleStreamingMessage ? "scroll-btn-glow" : ""
            }`}
            style={{
              opacity: isNearBottom ? 0 : 1,
              transform: isNearBottom ? "translateY(6px)" : "translateY(0)",
              pointerEvents: isNearBottom ? "none" : "auto",
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4 sm:w-[18px] sm:h-[18px] text-[var(--theme-text-tertiary)] group-hover/btn:text-[var(--theme-text-secondary)] transition-colors duration-200"
            >
              <path
                fillRule="evenodd"
                d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      )}

      {/* ChatInput at bottom (when messages exist, WelcomePage renders its own) */}
      {messages.length > 0 && (
        <div className="relative">
          <ChatInput {...chatInputProps} />
        </div>
      )}
    </SessionImageGalleryProvider>
  );
}
