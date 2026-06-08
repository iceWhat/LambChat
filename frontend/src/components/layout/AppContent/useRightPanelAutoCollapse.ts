import { useEffect, useRef } from "react";
import { subscribePersistentToolPanel } from "../../chat/ChatMessage/items/persistentToolPanelState";
import { SIDEBAR_COLLAPSED_STORAGE_KEY } from "../../../hooks/useAuth";

/**
 * Coordinates left sidebar collapse/restore with right panel open/close events.
 *
 * When a right panel (ToolResultPanel or EditorSidebar) opens at >=50% width on desktop,
 * auto-collapses the left sidebar. When it closes, restores the previous state.
 * If the user manually re-expands while the right panel is open, stops auto-collapsing.
 */
export function useRightPanelAutoCollapse(
  setSidebarCollapsed: (collapsed: boolean) => void,
): void {
  const savedStateRef = useRef<boolean | null>(null);
  const userOverrodeRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");

    function getRightPanelWidthPct(): number {
      const html = document.documentElement;
      let total = 0;
      if (html.getAttribute("data-sidebar-preview") === "open") {
        total += parseInt(
          localStorage.getItem("sidebar-preview-width") || "60",
          10,
        );
      }
      if (html.getAttribute("data-editor-sidebar") === "open") {
        total += parseInt(
          localStorage.getItem("editor-sidebar-width") || "30",
          10,
        );
      }
      return total;
    }

    function sync() {
      if (!mq.matches) return;

      const wideOpen = getRightPanelWidthPct() >= 50;

      if (wideOpen && !userOverrodeRef.current) {
        const stored = localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
        const isCurrentlyCollapsed = stored === "true";
        if (!isCurrentlyCollapsed) {
          savedStateRef.current = false;
          setSidebarCollapsed(true);
        }
      } else if (!wideOpen) {
        if (savedStateRef.current === false) {
          setSidebarCollapsed(false);
          savedStateRef.current = null;
          userOverrodeRef.current = false;
        }
      }
    }

    const unsubPanel = subscribePersistentToolPanel(sync);

    const attrObserver = new MutationObserver(() => {
      sync();
    });
    attrObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-sidebar-preview", "data-editor-sidebar", "style"],
    });

    const handleOverride = () => {
      userOverrodeRef.current = true;
    };
    window.addEventListener(
      "right-panel-auto-collapse:override",
      handleOverride,
    );

    return () => {
      unsubPanel();
      attrObserver.disconnect();
      window.removeEventListener(
        "right-panel-auto-collapse:override",
        handleOverride,
      );
    };
  }, [setSidebarCollapsed]);
}
