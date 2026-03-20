"use client";

import * as React from "react";

import { cn } from "@/components/ui/utils";

type ButtonVariant = "default" | "outline" | "ghost";
type ButtonSize = "default" | "sm" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  default:
    "bg-white text-zinc-900 hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-600",
  outline:
    "border border-white/[0.08] bg-transparent text-zinc-300 hover:bg-white/[0.05] hover:text-zinc-100 disabled:text-zinc-600",
  ghost: "bg-transparent text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200 disabled:text-zinc-600",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-9 px-4 py-2",
  sm: "h-8 px-3 text-[13px]",
  lg: "h-10 px-5 text-sm",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-600 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0b] disabled:pointer-events-none",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  ),
);

Button.displayName = "Button";
