import type { TeamMember } from "../../types/team";
import { TeamMemberCard } from "./TeamMemberCard";

interface TeamRosterProps {
  members: TeamMember[];
  defaultMemberId: string | null;
  onRemoveMember: (memberId: string) => void;
  onSetDefault: (memberId: string) => void;
  onToggleEnabled: (memberId: string) => void;
  onInstructionsChange: (memberId: string, text: string) => void;
}

export function TeamRoster({
  members,
  defaultMemberId,
  onRemoveMember,
  onSetDefault,
  onToggleEnabled,
  onInstructionsChange,
}: TeamRosterProps) {
  if (members.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Add roles from the left panel to build your team
      </div>
    );
  }

  return (
    <div className="space-y-2 p-3">
      {members.map((member) => (
        <TeamMemberCard
          key={member.member_id}
          member={member}
          isDefault={member.member_id === defaultMemberId}
          onRemove={() => onRemoveMember(member.member_id)}
          onSetDefault={() => onSetDefault(member.member_id)}
          onToggleEnabled={() => onToggleEnabled(member.member_id)}
          onInstructionsChange={(text) =>
            onInstructionsChange(member.member_id, text)
          }
        />
      ))}
    </div>
  );
}
