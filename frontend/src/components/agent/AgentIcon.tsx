import { DynamicIcon } from "../common/DynamicIcon";
import { modelIconSlugs } from "./modelIcon";
import { ModelIconImg } from "./modelIcon.tsx";

const lobeIconSlugSet = new Set(modelIconSlugs);

function resolveLobeIconSlug(icon?: string) {
  const trimmed = icon?.trim();
  if (!trimmed) return null;
  const prefixed = trimmed.match(/^(lobe|lobehub):(.+)$/i);
  const slug = (prefixed?.[2] || trimmed).toLowerCase();
  return lobeIconSlugSet.has(slug) ? slug : null;
}

export function AgentIcon({
  icon,
  size = 20,
  className,
}: {
  icon?: string;
  size?: number;
  className?: string;
}) {
  const lobeSlug = resolveLobeIconSlug(icon);
  if (lobeSlug) {
    return <ModelIconImg model={lobeSlug} icon={lobeSlug} size={size} />;
  }
  return <DynamicIcon name={icon || "Bot"} size={size} className={className} />;
}
