import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "neutral" | "destructive";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-clay text-on-clay hover:bg-clay-light active:bg-clay-deep",
  secondary:
    "border border-clay text-clay hover:bg-clay-wash active:border-clay-deep active:text-clay-deep",
  neutral: "bg-surface-raised text-text hover:bg-border",
  destructive: "text-danger hover:bg-clay-wash",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  icon?: ReactNode;
  full?: boolean;
};

export function Button({
  variant = "neutral",
  icon,
  full = false,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-control px-5 text-body font-medium transition-colors disabled:pointer-events-none disabled:text-text-faint",
        variants[variant],
        full && "w-full",
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
