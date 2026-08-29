import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/format";

export function Money({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  return (
    <span className={cn("tabular-nums", className)}>{formatBRL(value)}</span>
  );
}
