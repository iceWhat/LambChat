import { useState } from "react";
import { Star, ChevronDown, ChevronRight } from "lucide-react";
import type { TeamMember } from "../../types/team";
import { nameToGradient } from "../common/cardUtils";
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
}

export function TeamMemberCard({
  member,
  isDefault,
  onRemove,
  onSetDefault,
  onToggleEnabled,
  onInstructionsChange,
}: TeamMemberCardProps) {
  const [expanded, setExpanded] = useState(!!member.role_instructions);
  const colors = nameToGradient(member.role_name || "role");

  return (
    <div
      className={`team-member-card group ${
        member.enabled ? "" : "team-member-card--disabled"
      }`}
      style={{ "--team-accent": colors[0] } as React.CSSProperties}
    >
      <div className="team-member-card__body">
        {/* Top row */}
        <div className="team-member-card__top">
          {/* Avatar */}
          {isPersonaImageAvatar(member.role_avatar) ||
          isEmojiAvatar(member.role_avatar) ? (
            <div className="scb__avatar-ring shrink-0">
              <PersonaAvatarImage
                avatar={
                  isEmojiAvatar(member.role_avatar)
                    ? getEmojiAvatarUrl(member.role_avatar)
                    : member.role_avatar
                }
                alt=""
                className="scb__avatar-img"
              />
            </div>
          ) : (
            <div className="scb__icon-ring shrink-0">
              <PersonaAvatarIcon
                avatar={member.role_avatar}
                primaryTag={member.role_tags[0]}
                size={19}
                className="text-[var(--theme-primary)]"
              />
            </div>
          )}

          {/* Name + badges */}
          <span className="team-member-card__name">
            {member.role_name || "Unnamed Role"}
          </span>
          {isDefault && (
            <span className="team-member-card__default-badge">Default</span>
          )}

          {/* Toggle switch */}
          <button
            onClick={onToggleEnabled}
            className={`team-toggle ${member.enabled ? "team-toggle--on" : ""}`}
            title={member.enabled ? "Disable role" : "Enable role"}
            type="button"
            role="switch"
            aria-checked={member.enabled}
          />
        </div>

        {/* Tags */}
        {member.role_tags.length > 0 && (
          <div className="team-member-card__tags">
            {member.role_tags.slice(0, 4).map((tag) => (
              <span key={tag} className="scb__mini-tag">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Instructions area */}
        <div className="team-member-card__instructions">
          <button
            className="team-member-card__instructions-trigger"
            onClick={() => setExpanded(!expanded)}
            type="button"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Role instructions
          </button>
          {expanded && (
            <div className="team-member-card__instructions-area">
              <textarea
                value={member.role_instructions}
                onChange={(e) => onInstructionsChange(e.target.value)}
                placeholder="Role-specific instructions..."
                className="ppe-textarea min-h-[4rem]"
                rows={3}
              />
            </div>
          )}
        </div>

        {/* Bottom actions (hover visible) */}
        <div className="team-member-card__bottom-actions">
          <button
            onClick={onSetDefault}
            className={`scb__action-btn scb__action-btn--ghost ${
              isDefault ? "text-amber-500" : ""
            }`}
            title="Set as default"
            type="button"
          >
            <Star size={12} />
          </button>
          <button
            onClick={onRemove}
            className="scb__action-btn scb__action-btn--ghost"
            title="Remove"
            type="button"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
