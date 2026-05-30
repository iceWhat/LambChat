/**
 * Agent + Model 统一管理面板
 * 合并助手配置和模型配置到一个页面，通过顶部 tab 切换
 */

import { useState, useCallback } from "react";
import { Bot, Cpu, RefreshCw, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { PanelHeader } from "../../common/PanelHeader";
import { AgentSection } from "./AgentSection";
import { ModelSection } from "./ModelSection";

export type SectionType = "agents" | "models";

export function AgentModelPanel() {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState<SectionType>("agents");
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const sections: {
    id: SectionType;
    label: string;
    icon: typeof Bot;
  }[] = [
    { id: "agents", label: t("agentConfig.agentsSection"), icon: Bot },
    { id: "models", label: t("agentConfig.modelsSection"), icon: Cpu },
  ];

  return (
    <div className="glass-shell flex h-full flex-col min-h-0">
      <PanelHeader
        title={t("agentConfig.combinedTitle")}
        subtitle={t("agentConfig.combinedSubtitle")}
        icon={<Settings2 size={20} className="text-theme-text-secondary" />}
        actions={
          <button
            onClick={handleRefresh}
            className="btn-secondary"
            aria-label={t("common.refresh")}
          >
            <RefreshCw size={16} />
            <span className="hidden text-sm sm:inline">
              {t("common.refresh")}
            </span>
          </button>
        }
      >
        <div className="mt-3 inline-grid grid-cols-2 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-1 sm:my-3">
          {sections.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection === section.id;
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 ${
                  isActive
                    ? "bg-white text-stone-950 shadow-sm ring-1 ring-[var(--glass-border)] dark:bg-stone-800 dark:text-stone-50"
                    : "text-stone-500 hover:bg-white/60 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800/60 dark:hover:text-stone-100"
                }`}
              >
                <Icon size={16} className="flex-shrink-0" />
                <span>{section.label}</span>
              </button>
            );
          })}
        </div>
      </PanelHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeSection === "agents" ? (
          <AgentSection key={`agents-${refreshKey}`} />
        ) : (
          <ModelSection key={`models-${refreshKey}`} />
        )}
      </div>
    </div>
  );
}

export default AgentModelPanel;
