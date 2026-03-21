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
    <div className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-zinc-100", className)}>
      <div
        className="h-full rounded-full bg-zinc-900"
        style={{
          width: `${clamped}%`,
          transition: "width 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />
    </div>
  );
}
