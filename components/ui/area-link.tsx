import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { IconCircle } from "./icon-circle";

export function AreaLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="flex min-h-12 flex-col items-start gap-3 rounded-card border border-border bg-surface p-4 transition-colors hover:bg-surface-raised"
    >
      <IconCircle icon={icon} />
      <span className="text-label font-medium text-text">{label}</span>
    </Link>
  );
}
