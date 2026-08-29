import type { LucideIcon } from "lucide-react";
import { IconCircle } from "./icon-circle";

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface px-6 py-10 text-center">
      <IconCircle icon={icon} />
      <p className="text-body font-medium text-text">{title}</p>
      {description ? (
        <p className="text-label text-text-muted">{description}</p>
      ) : null}
    </div>
  );
}
