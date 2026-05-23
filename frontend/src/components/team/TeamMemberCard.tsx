import { GripVertical, X, Star } from "lucide-react";
import type { TeamMember } from "../../types/team";

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
  return (
    <div
      className={`flex items-start gap-2 p-3 rounded-lg border ${
        member.enabled
          ? "border-border bg-card"
          : "border-border/50 bg-muted/30 opacity-60"
      }`}
    >
      <GripVertical className="h-4 w-4 mt-1 text-muted-foreground cursor-grab" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {member.role_name || "Unnamed Role"}
          </span>
          {isDefault && (
            <span className="px-1.5 py-0.5 text-[10px] rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              Default
            </span>
          )}
          <button
            onClick={onSetDefault}
            className="p-1 rounded hover:bg-accent"
            title="Set as default role"
          >
            <Star
              className={`h-3 w-3 ${
                isDefault
                  ? "fill-amber-400 text-amber-400"
                  : "text-muted-foreground"
              }`}
            />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {member.role_tags.slice(0, 3).join(", ")}
        </p>
        <textarea
          value={member.role_instructions}
          onChange={(e) => onInstructionsChange(e.target.value)}
          placeholder="Role-specific instructions..."
          className="w-full mt-2 p-2 text-xs rounded bg-muted resize-none"
          rows={2}
        />
      </div>
      <div className="flex flex-col gap-1">
        <button
          onClick={onToggleEnabled}
          className={`px-2 py-0.5 text-[10px] rounded ${
            member.enabled
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {member.enabled ? "ON" : "OFF"}
        </button>
        <button
          onClick={onRemove}
          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
          title="Remove from team"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
