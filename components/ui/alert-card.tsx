import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/cn";

export function AlertCard({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-l-[3px] border-clay bg-surface-raised p-4",
        className,
      )}
    >
      <p className="flex items-center gap-2 text-label text-text-muted">
        <AlertCircle size={20} strokeWidth={1.75} className="text-clay" />
        {label}
      </p>
      {children}
    </div>
  );
}
