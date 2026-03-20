"use client";

import { useMemo, useState } from "react";

import { FileDropzone } from "@/components/FileDropzone";
import { ProgressStep } from "@/components/ProgressStep";
import { ResultsTable } from "@/components/ResultsTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import type { EmailResult, LeadInput } from "@/lib/types";

type StreamEvent =
  | { type: "start"; total: number }
  | { type: "progress"; current: number; total: number; name: string }
  | ({ type: "result" } & EmailResult)
  | { type: "complete"; results: EmailResult[] }
  | { type: "error"; message: string };

function parseSseChunk(chunk: string) {
  const messages = chunk.split("\n\n");
  const parsed: StreamEvent[] = [];

  for (const message of messages) {
    const lines = message.split("\n").filter(Boolean);
    if (!lines.length) {
      continue;
    }

    const eventLine = lines.find((line) => line.startsWith("event:"));
    const dataLine = lines.find((line) => line.startsWith("data:"));
    if (!eventLine || !dataLine) {
      continue;
    }

    const type = eventLine.replace("event:", "").trim();
    const payload = JSON.parse(dataLine.replace("data:", "").trim()) as Omit<StreamEvent, "type">;
    parsed.push({ type, ...payload } as StreamEvent);
  }

  return parsed;
}

export default function Home() {
  const [leads, setLeads] = useState<LeadInput[]>([]);
  const [reoonApiKey, setReoonApiKey] = useState("");
  const [results, setResults] = useState<EmailResult[]>([]);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);
  const [activeName, setActiveName] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState("");

  const stepState = useMemo(
    () => ({
      upload: leads.length > 0,
      key: reoonApiKey.trim().length > 0,
      run: isRunning,
      results: results.length > 0,
    }),
    [isRunning, leads.length, reoonApiKey, results.length],
  );

  async function runFinder() {
    setIsRunning(true);
    setError("");
    setResults([]);
    setCurrent(0);
    setTotal(leads.length);
    setActiveName("");

    try {
      const response = await fetch("/api/find-emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          leads,
          reoonApiKey,
        }),
      });

      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to start the email finder.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const boundary = buffer.lastIndexOf("\n\n");
        if (boundary === -1) {
          continue;
        }

        const complete = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        for (const event of parseSseChunk(complete)) {
          if (event.type === "start") {
            setTotal(event.total);
          }

          if (event.type === "progress") {
            setCurrent(event.current);
            setTotal(event.total);
            setActiveName(event.name);
          }

          if (event.type === "result") {
            setResults((previous) => [...previous, event]);
          }

          if (event.type === "complete") {
            setResults(event.results);
            setCurrent(event.results.length);
            setActiveName("");
          }

          if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unexpected error.");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <main className="min-h-screen bg-white px-6 py-12">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <section className="space-y-3">
          <p className="text-sm font-medium text-zinc-500">Email Finder</p>
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-900">
            Find and verify emails from a CSV.
          </h1>
          <p className="text-base leading-7 text-zinc-600">
            Upload a list with names and companies, paste a Reoon API key, and download the
            verified results.
          </p>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Flow</CardTitle>
            <CardDescription>Upload, configure, run, review, and download in one page.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 text-sm sm:grid-cols-5">
              {[
                { label: "1. Upload", complete: stepState.upload },
                { label: "2. API key", complete: stepState.key },
                { label: "3. Run", complete: stepState.run },
                { label: "4. Results", complete: stepState.results },
                { label: "5. Download", complete: stepState.results },
              ].map(({ label, complete }) => (
                <div
                  key={label}
                  className={`rounded-md border px-3 py-2 ${
                    complete ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 text-zinc-500"
                  }`}
                >
                  {label}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <FileDropzone onLeadsParsed={setLeads} />

        <Card>
          <CardHeader>
            <CardTitle>Reoon API key</CardTitle>
            <CardDescription>
              Your key is sent only with this request and is never stored.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Paste your Reoon API key"
              value={reoonApiKey}
              onChange={(event) => setReoonApiKey(event.target.value)}
            />
            <Separator />
            <div className="flex items-center justify-between gap-4 text-sm text-zinc-600">
              <span>{leads.length} leads ready</span>
              <Button
                disabled={!leads.length || !reoonApiKey.trim() || isRunning}
                onClick={() => void runFinder()}
              >
                {isRunning ? "Running..." : "Run email finder"}
              </Button>
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </CardContent>
        </Card>

        {(isRunning || current > 0) && <ProgressStep current={current} total={total} activeName={activeName} />}

        {results.length > 0 && <ResultsTable results={results} />}
      </div>
    </main>
  );
}
