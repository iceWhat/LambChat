import { useState } from "react";
import { Bot, ChevronDown, ChevronRight, Cpu, Star, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TeamMember } from "../../types/team";
import type { ModelOption } from "../../services/api/model";
import type { AgentInfo } from "../../types/agent";
import {
  PersonaAvatarIcon,
  PersonaAvatarImage,
} from "../persona/PersonaAvatarIcon";
import {
  getEmojiAvatarUrl,
  isEmojiAvatar,
  isPersonaImageAvatar,
} from "../persona/personaAvatar";

interface TeamMemberCardProps {
  member: TeamMember;
  isDefault: boolean;
  onRemove: () => void;
  onSetDefault: () => void;
  onToggleEnabled: () => void;
  onInstructionsChange: (text: string) => void;
  availableModels?: ModelOption[];
  onModelChange?: (modelId: string | null) => void;
  availableAgents?: AgentInfo[];
  onAgentChange?: (agentId: string | null) => void;
}

export function TeamMemberCard({
  member,
  isDefault,
  onRemove,
  onSetDefault,
  onToggleEnabled,
  onInstructionsChange,
  availableModels = [],
  onModelChange,
  availableAgents = [],
  onAgentChange,
}: TeamMemberCardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(!!member.role_instructions);
  const selectedModel = member.model_id
    ? availableModels.find((model) => model.id === member.model_id)
    : null;
  const modelLabel = member.model_id
    ? selectedModel?.label || selectedModel?.value || member.model_id
    : t("team.followSessionModel", "跟随会话模型");
  const selectedAgent = member.agent_id
    ? availableAgents.find((agent) => agent.id === member.agent_id)
    : null;
  const agentLabel = member.agent_id
    ? selectedAgent?.name || member.agent_id
    : t("team.followTeamMode", "跟随团队模式");

  return (
    <div
      className={`list-item-card ${
        member.enabled ? "" : "list-item-card--disabled"
      }`}
    >
      <div className="list-item-card__body">
        {/* Main row: avatar + name + tags + actions */}
        <div className="list-item-card__top">
          <div className="team-member-card__avatar-btn">
            {isPersonaImageAvatar(member.role_avatar) ||
            isEmojiAvatar(member.role_avatar) ? (
              <div className="team-member-card__avatar">
                <PersonaAvatarImage
                  avatar={
                    isEmojiAvatar(member.role_avatar)
                      ? getEmojiAvatarUrl(member.role_avatar)
                      : member.role_avatar
                  }
                  alt=""
                  className="team-member-card__avatar-img"
                />
              </div>
            ) : (
              <div className="team-member-card__avatar team-member-card__avatar--icon">
                <PersonaAvatarIcon
                  avatar={member.role_avatar}
                  primaryTag={member.role_tags[0]}
                  size={18}
                  className="text-[var(--theme-primary)]"
                />
              </div>
            )}
          </div>

          <div className="list-item-card__identity">
            <span className="list-item-card__name">
              {member.role_name || t("team.unnamedRole")}
            </span>
            {member.role_tags.length > 0 && (
              <span className="team-member-card__tags">
                {member.role_tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="team-member-card__tag">
                    {tag}
                  </span>
                ))}
              </span>
            )}
            <span
              className="team-member-card__model"
              title={agentLabel}
            >
              <Bot size={11} />
              <span>{agentLabel}</span>
            </span>
            <span
              className="team-member-card__model"
              title={modelLabel}
            >
              <Cpu size={11} />
              <span>{modelLabel}</span>
            </span>
          </div>

          {/* Inline actions */}
          <div className="list-item-card__actions">
            <button
              onClick={onSetDefault}
              className={`team-member-card__action-btn ${
                isDefault ? "team-member-card__action-btn--active" : ""
              }`}
              title={isDefault ? t("team.defaultRole") : t("team.setDefault")}
              type="button"
            >
              <Star size={14} fill={isDefault ? "currentColor" : "none"} />
            </button>
            <button
              onClick={onRemove}
              className="team-member-card__action-btn team-member-card__action-btn--danger"
              title={t("team.remove")}
              type="button"
            >
              <Trash2 size={14} />
            </button>
          </div>

          {/* Toggle */}
          <button
            onClick={onToggleEnabled}
            className={`team-toggle ${member.enabled ? "team-toggle--on" : ""}`}
            title={
              member.enabled ? t("team.disableRole") : t("team.enableRole")
            }
            type="button"
            role="switch"
            aria-checked={member.enabled}
          />

          {/* Expand chevron */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="team-member-card__expand-btn"
            type="button"
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        </div>

        {/* Collapsible instructions */}
        {expanded && (
          <div className="list-item-card__instructions">
            <label className="ppe-label">
              <Bot size={13} className="ppe-label-icon" />
              {t("team.memberMode", "成员模式")}
            </label>
            <select
              value={member.agent_id ?? ""}
              onChange={(e) => onAgentChange?.(e.target.value || null)}
              className="ppe-input"
              disabled={!onAgentChange}
            >
              <option value="">
                {t("team.followTeamMode", "跟随团队模式")}
              </option>
              {availableAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name || agent.id}
                </option>
              ))}
            </select>
            <label className="ppe-label">
              <Cpu size={13} className="ppe-label-icon" />
              {t("team.memberModel", "成员模型")}
            </label>
            <select
              value={member.model_id ?? ""}
              onChange={(e) => onModelChange?.(e.target.value || null)}
              className="ppe-input"
              disabled={!onModelChange}
            >
              <option value="">
                {t("team.followSessionModel", "跟随会话模型")}
              </option>
              {availableModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label || model.value}
                </option>
              ))}
            </select>
            <textarea
              value={member.role_instructions}
              onChange={(e) => onInstructionsChange(e.target.value)}
              placeholder={t("team.roleInstructionsPlaceholder")}
              className="ppe-textarea"
              rows={3}
            />
          </div>
        )}
      </div>
    </div>
  );
}
