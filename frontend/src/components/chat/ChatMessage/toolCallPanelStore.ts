import type { CollapsibleStatus } from "../../common/CollapsiblePill";

export interface ToolCallPanelData {
  /** Tool call ID (part.id) */
  toolCallId: string;
  toolName: string;
  formattedToolName: string;
  args: Record<string, unknown>;
  result?: string | Record<string, unknown>;
  success?: boolean;
  isPending?: boolean;
  cancelled?: boolean;
  startedAt?: string;
  completedAt?: string;
  status: CollapsibleStatus;
}

type Listener = () => void;

function shallowEqual(a: ToolCallPanelData, b: ToolCallPanelData): boolean {
  return (
    a.toolCallId === b.toolCallId &&
    a.toolName === b.toolName &&
    a.status === b.status &&
    a.isPending === b.isPending &&
    a.cancelled === b.cancelled &&
    a.success === b.success &&
    a.startedAt === b.startedAt &&
    a.completedAt === b.completedAt &&
    a.result === b.result
  );
}

export interface ToolCallPanelStore {
  delete: (toolCallId: string) => void;
  get: (toolCallId: string) => ToolCallPanelData | undefined;
  set: (data: ToolCallPanelData) => void;
  subscribe: (toolCallId: string, listener: Listener) => () => void;
}

export function createToolCallPanelStore(): ToolCallPanelStore {
  const data = new Map<string, ToolCallPanelData>();
  const listeners = new Map<string, Set<Listener>>();

  function emit(toolCallId: string) {
    const subscribed = listeners.get(toolCallId);
    if (!subscribed) return;
    subscribed.forEach((listener) => listener());
  }

  return {
    delete(toolCallId) {
      if (!data.delete(toolCallId)) return;
      emit(toolCallId);
    },
    get(toolCallId) {
      return data.get(toolCallId);
    },
    set(next) {
      const prev = data.get(next.toolCallId);
      if (prev && shallowEqual(prev, next)) return;
      data.set(next.toolCallId, next);
      emit(next.toolCallId);
    },
    subscribe(toolCallId, listener) {
      const subscribed = listeners.get(toolCallId) ?? new Set<Listener>();
      subscribed.add(listener);
      listeners.set(toolCallId, subscribed);

      return () => {
        const current = listeners.get(toolCallId);
        if (!current) return;
        current.delete(listener);
        if (current.size === 0) listeners.delete(toolCallId);
      };
    },
  };
}

export const toolCallPanelStore = createToolCallPanelStore();
