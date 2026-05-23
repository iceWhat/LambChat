import { useMemo } from "react";
import { Search, Plus } from "lucide-react";
import type { PersonaPreset } from "../../types";
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

interface RoleSquareProps {
  presets: PersonaPreset[];
  loading?: boolean;
  onAddRole: (preset: PersonaPreset) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

function renderAvatar(preset: PersonaPreset) {
  if (isPersonaImageAvatar(preset.avatar) || isEmojiAvatar(preset.avatar)) {
    return (
      <div
        className="scb__avatar-ring shrink-0"
        style={{ width: 28, height: 28 }}
      >
        <PersonaAvatarImage
          avatar={
            isEmojiAvatar(preset.avatar)
              ? getEmojiAvatarUrl(preset.avatar)
              : preset.avatar
          }
          alt=""
          className="scb__avatar-img"
        />
      </div>
    );
  }
  return (
    <div className="scb__icon-ring shrink-0" style={{ width: 28, height: 28 }}>
      <PersonaAvatarIcon
        avatar={preset.avatar}
        primaryTag={preset.tags[0]}
        size={16}
        className="text-[var(--theme-primary)]"
      />
    </div>
  );
}

export function RoleSquare({
  presets,
  loading,
  onAddRole,
  searchQuery,
  onSearchChange,
}: RoleSquareProps) {
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return presets;
    const q = searchQuery.toLowerCase();
    return presets.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [presets, searchQuery]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="team-pane-header">
        <h2 className="team-pane-title">
          Role library
          <span className="team-pane-count">{filtered.length}</span>
        </h2>
      </div>
      <div className="team-pane-search">
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--theme-text-secondary)] pointer-events-none" />
        <input
          type="text"
          placeholder="Search roles..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="panel-search"
        />
      </div>
      <div className="team-role-list">
        {loading && (
          <p className="py-8 text-center text-xs text-[var(--theme-text-secondary)]">
            Loading roles...
          </p>
        )}
        {!loading && filtered.length === 0 && (
          <p className="py-8 text-center text-xs text-[var(--theme-text-secondary)]">
            No roles found.
          </p>
        )}
        {filtered.map((preset) => {
          const colors = nameToGradient(preset.name);
          return (
            <div
              key={preset.id}
              className="team-role-card group"
              style={{ "--team-accent": colors[0] } as React.CSSProperties}
            >
              {renderAvatar(preset)}
              <span className="team-role-card__name">{preset.name}</span>
              {preset.tags.length > 0 && (
                <div className="team-role-card__tags">
                  {preset.tags.slice(0, 2).map((tag) => (
                    <span key={tag} className="scb__mini-tag">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <button
                onClick={() => onAddRole(preset)}
                className="scb__action-btn scb__action-btn--ghost shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                title="Add to team"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
