import { DEFAULT_THINKING_LEVEL_STORAGE_KEY } from "../components/layout/AppContent/useAgentOptions";

export const SIDEBAR_COLLAPSED_STORAGE_KEY = "lamb-sidebar-collapsed";
export const NEWLINE_MODIFIER_STORAGE_KEY = "newlineModifier";
export const DEFAULT_MODEL_ID_STORAGE_KEY = "defaultModelId";
export const DEFAULT_MODEL_STORAGE_KEY = "defaultModel";

type UserMetadataPreferences = {
  language?: unknown;
  theme?: unknown;
  newlineModifier?: unknown;
  defaultThinkingLevel?: unknown;
  sidebarCollapsed?: unknown;
  defaultModelId?: unknown;
  defaultModel?: unknown;
};

type StorageLike = Pick<Storage, "setItem">;

type ApplyUserMetadataPreferencesOptions = {
  metadata?: UserMetadataPreferences | null;
  localStorage: StorageLike;
  changeLanguage: (language: string) => void;
  dispatchEvent: (event: CustomEvent) => void;
};

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function applyUserMetadataPreferences({
  metadata,
  localStorage,
  changeLanguage,
  dispatchEvent,
}: ApplyUserMetadataPreferencesOptions) {
  if (!metadata) return;

  const language = stringValue(metadata.language);
  if (language) {
    localStorage.setItem("language", language);
    changeLanguage(language);
  }

  const theme = stringValue(metadata.theme);
  if (theme) {
    localStorage.setItem("lamb-agent-theme", theme);
    dispatchEvent(new CustomEvent("theme:external-change", { detail: theme }));
  }

  const newlineModifier = stringValue(metadata.newlineModifier);
  if (newlineModifier) {
    localStorage.setItem(NEWLINE_MODIFIER_STORAGE_KEY, newlineModifier);
  }

  const defaultThinkingLevel = stringValue(metadata.defaultThinkingLevel);
  if (defaultThinkingLevel) {
    localStorage.setItem(
      DEFAULT_THINKING_LEVEL_STORAGE_KEY,
      defaultThinkingLevel,
    );
    dispatchEvent(
      new CustomEvent("thinking-preference-updated", {
        detail: defaultThinkingLevel,
      }),
    );
  }

  if (metadata.sidebarCollapsed !== undefined) {
    const sidebarCollapsed = String(metadata.sidebarCollapsed);
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, sidebarCollapsed);
    dispatchEvent(
      new CustomEvent("sidebar-collapsed-changed", {
        detail: sidebarCollapsed === "true",
      }),
    );
  }

  const defaultModelId = stringValue(metadata.defaultModelId);
  const defaultModel = stringValue(metadata.defaultModel);
  if (defaultModelId || defaultModel) {
    if (defaultModelId) {
      localStorage.setItem(DEFAULT_MODEL_ID_STORAGE_KEY, defaultModelId);
    }
    if (defaultModel) {
      localStorage.setItem(DEFAULT_MODEL_STORAGE_KEY, defaultModel);
    }
    dispatchEvent(
      new CustomEvent("model-preference-updated", {
        detail: {
          modelId: defaultModelId ?? "",
          modelValue: defaultModel ?? "",
        },
      }),
    );
  }
}
