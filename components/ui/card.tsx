import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  variant?: "default" | "raised";
};

export function Card({
  variant = "default",
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-card border border-border p-4",
        variant === "raised" ? "bg-surface-raised" : "bg-surface",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
