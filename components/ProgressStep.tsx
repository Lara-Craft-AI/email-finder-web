"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export function ProgressStep({
  current,
  total,
  activeName,
  activeLeadDetail,
  verifiedCount,
  isSecondPass,
}: {
  current: number;
  total: number;
  activeName: string;
  activeLeadDetail?: string;
  verifiedCount?: number;
  isSecondPass?: boolean;
}) {
  const value = total ? (current / total) * 100 : 0;
  const [lastUpdateTime, setLastUpdateTime] = useState(Date.now());
  const [showReassurance, setShowReassurance] = useState(false);

  // Track when current changes to detect stalls
  useEffect(() => {
    setLastUpdateTime(Date.now());
    setShowReassurance(false);
  }, [current]);

  // Show "Still working..." if no update for 3s
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowReassurance(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, [lastUpdateTime]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-zinc-900 animate-pulse" />
          {isSecondPass ? "Second Pass" : "Running"}
        </CardTitle>
        <CardDescription>Finding domains and verifying email candidates in real time.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={value} />
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>
              {current} of {total}
            </span>
            <span className="font-mono">{activeName || "Starting..."}</span>
          </div>
          {activeLeadDetail && (
            <p className="text-xs text-zinc-400 truncate">
              {activeLeadDetail}
            </p>
          )}
          <div className="flex items-center justify-between">
            {(verifiedCount ?? 0) > 0 && (
              <span className="text-xs font-medium text-emerald-600">
                {verifiedCount} verified so far
              </span>
            )}
            {showReassurance && current < total && (
              <span className="text-xs text-amber-500 animate-pulse">
                Still working...
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
