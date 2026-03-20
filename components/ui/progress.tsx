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
    <div className={cn("relative h-2 w-full overflow-hidden rounded-full bg-zinc-100", className)}>
      <div
        className="h-full rounded-full bg-zinc-900 transition-all"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
