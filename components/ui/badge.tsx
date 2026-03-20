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
    default: "border-transparent bg-zinc-900 text-white",
    secondary: "border-zinc-200 bg-zinc-100 text-zinc-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
