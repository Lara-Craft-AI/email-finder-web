import type { ReactNode } from "react";

import { cn } from "@/components/ui/utils";

export function Badge({
  className,
  variant = "default",
  children,
}: {
  className?: string;
  variant?: "default" | "secondary" | "success" | "warning";
  children: ReactNode;
}) {
  const variants = {
    default: "border-transparent bg-white text-zinc-900",
    secondary: "border-white/[0.06] bg-white/[0.04] text-zinc-500",
    success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
    warning: "border-amber-500/20 bg-amber-500/10 text-amber-400",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
