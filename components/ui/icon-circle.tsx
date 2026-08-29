import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export function IconCircle({
  icon: Icon,
  className,
}: {
  icon: LucideIcon;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-raised",
        className,
      )}
    >
      <Icon size={24} strokeWidth={1.75} className="text-clay" />
    </span>
  );
}
