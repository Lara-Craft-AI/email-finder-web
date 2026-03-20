import { cn } from "@/components/ui/utils";

export function Progress({
  className,
  value = 0,
}: {
  className?: string;
  value?: number;
}) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]", className)}>
      <div
        className="h-full rounded-full bg-white transition-all"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
