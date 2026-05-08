interface AgentAvatarProps {
  y: number;
}

export function AgentAvatar({ y }: AgentAvatarProps) {
  return (
    <div className="agent-avatar" style={{ top: `${y}%` }} aria-hidden="true">
      <span />
    </div>
  );
}
