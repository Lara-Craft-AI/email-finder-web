import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export function ProgressStep({
  current,
  total,
  activeName,
}: {
  current: number;
  total: number;
  activeName: string;
}) {
  const value = total ? (current / total) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Running</CardTitle>
        <CardDescription>Finding domains and verifying email candidates in real time.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={value} />
        <div className="flex items-center justify-between text-sm text-zinc-600">
          <span>
            {current} of {total}
          </span>
          <span>{activeName || "Starting..."}</span>
        </div>
      </CardContent>
    </Card>
  );
}
