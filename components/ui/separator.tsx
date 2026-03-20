import { cn } from "@/components/ui/utils";

export function Separator({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-white/[0.06]", className)} />;
}
