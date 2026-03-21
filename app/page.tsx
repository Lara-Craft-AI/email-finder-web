"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Info, Lock } from "lucide-react";

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
  | { type: "second_pass_start"; count: number }
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
    try {
      const payload = JSON.parse(dataLine.replace("data:", "").trim()) as Omit<StreamEvent, "type">;
      parsed.push({ type, ...payload } as StreamEvent);
    } catch {
      // Skip malformed SSE messages instead of crashing the stream
    }
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
  const [isApiKeyInfoOpen, setIsApiKeyInfoOpen] = useState(false);
  const isSecondPassRef = useRef(false);
  const apiKeyInfoId = useId();
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

        if (value) {
          buffer += decoder.decode(value, { stream: true });
        }

        if (done) {
          // Flush remaining decoder bytes
          buffer += decoder.decode();
        }

        const boundary = buffer.lastIndexOf("\n\n");
        if (boundary === -1) {
          if (done) break;
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
            setActiveName((isSecondPassRef.current ? "[2nd pass] " : "") + event.name);
          }

          if (event.type === "second_pass_start") {
            isSecondPassRef.current = true;
            setCurrent(0);
            setTotal(event.count);
            setActiveName(`Second pass: ${event.count} not_found leads`);
          }

          if (event.type === "result") {
            setResults((previous) => {
              const existingIndex = previous.findIndex(
                (r) => r.name === event.name && r.company === event.company,
              );
              if (existingIndex >= 0) {
                const updated = [...previous];
                updated[existingIndex] = event;
                return updated;
              }
              return [...previous, event];
            });
          }

          if (event.type === "complete") {
            isSecondPassRef.current = false;
            const deduped = new Map<string, typeof event.results[number]>();
            for (const r of event.results) {
              deduped.set(`${r.name}\0${r.company}`, r);
            }
            setResults([...deduped.values()]);
            setIsRunning(false);
            setCurrent(0);
            setTotal(0);
            setActiveName("");
          }

          if (event.type === "error") {
            throw new Error(event.message);
          }
        }

        if (done) break;
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unexpected error.");
    } finally {
      isSecondPassRef.current = false;
      setIsRunning(false);
      setCurrent(0);
      setTotal(0);
      setActiveName("");
    }
  }

  const steps = [
    { label: "Upload", done: stepState.upload },
    { label: "API key", done: stepState.key },
    { label: "Run", done: stepState.run },
    { label: "Results", done: stepState.results },
    { label: "Download", done: stepState.results },
  ];

  return (
    <main className="min-h-screen bg-white px-4 py-6 sm:px-6 sm:py-16">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 sm:gap-10">
        <section className="space-y-4 sm:space-y-6">
          <div className="space-y-2 sm:space-y-3">
            <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">Email Finder</p>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
              Find verified emails for $0.001 each.
            </h1>
            <p className="text-[15px] leading-relaxed text-zinc-500">
              50–100× cheaper than Apollo. Upload → verify → export.
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-zinc-200 text-xs sm:text-sm">
            <div className="min-w-[260px]">
              <div className="grid grid-cols-3 border-b border-zinc-200 px-2.5 py-2 text-xs font-medium text-zinc-400 sm:px-4 sm:py-2.5">
                <span></span>
                <span>Apollo</span>
                <span className="text-zinc-700">Email Finder</span>
              </div>
              <div className="divide-y divide-zinc-100">
                {[
                  ["Per email", "$0.05-0.10", "~$0.001"],
                  ["1k emails", "$50-100", "~$1"],
                  ["10k emails", "$500-1k", "~$10"],
                  ["Verification", "Bundled", "SMTP"],
                ].map(([label, apollo, ours]) => (
                  <div key={label} className="grid grid-cols-3 px-2.5 py-2 sm:px-4 sm:py-3">
                    <span className="text-zinc-500">{label}</span>
                    <span className="text-zinc-400">{apollo}</span>
                    <span className="font-medium text-zinc-800">{ours}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="border-t border-zinc-200 px-2.5 py-2 text-xs text-zinc-400 sm:px-4 sm:py-2.5">
              Powered by{" "}
              <a
                href="https://reoon.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-zinc-600"
              >
                Reoon
              </a>{" "}
              — BYOK, pay per use.
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
          {steps.map((step, i) => (
            <div key={step.label} className="flex items-center gap-1.5 sm:gap-2">
              {i > 0 && <div className="hidden h-px w-4 bg-zinc-200 sm:block" />}
              <div
                className={`whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors sm:px-3 sm:py-1.5 sm:text-xs ${
                  step.done
                    ? "bg-zinc-900 text-white"
                    : "border border-zinc-200 text-zinc-400"
                }`}
              >
                {step.label}
              </div>
            </div>
          ))}
        </div>

        <FileDropzone onLeadsParsed={setLeads} />

        <Card className="relative">
          <div
            className="absolute top-4 right-4 z-10"
            onMouseEnter={() => setIsApiKeyInfoOpen(true)}
            onMouseLeave={() => setIsApiKeyInfoOpen(false)}
          >
            <button
              type="button"
              aria-label="How to get a Reoon API key"
              aria-describedby={apiKeyInfoId}
              aria-expanded={isApiKeyInfoOpen}
              onClick={() => setIsApiKeyInfoOpen((previous) => !previous)}
              onFocus={() => setIsApiKeyInfoOpen(true)}
              onBlur={() => setIsApiKeyInfoOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 text-zinc-400 transition-colors hover:border-zinc-300 hover:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
            >
              <Info size={14} />
            </button>
            <div
              id={apiKeyInfoId}
              role="tooltip"
              className={`absolute top-9 right-0 w-64 rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-2 text-xs leading-5 text-zinc-600 shadow-xl transition-all ${
                isApiKeyInfoOpen
                  ? "pointer-events-auto translate-y-0 opacity-100"
                  : "pointer-events-none -translate-y-1 opacity-0"
              }`}
            >
              Go on{" "}
              <a
                href="https://www.reoon.com/email-verifier/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-zinc-800"
              >
                https://www.reoon.com/email-verifier/
              </a>{" "}
              to get an API key
            </div>
          </div>
          <CardHeader className="pr-14">
            <CardTitle>Reoon API key</CardTitle>
            <CardDescription className="flex items-start gap-1.5">
              <Lock size={13} className="mt-0.5 shrink-0 text-zinc-400" />
              Never stored.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Paste your Reoon API key"
              value={reoonApiKey}
              onChange={(event) => setReoonApiKey(event.target.value)}
            />
            <Separator />
            <div className="flex flex-col gap-3 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <span>{leads.length} leads ready</span>
              <Button
                className="w-full sm:w-auto"
                disabled={!leads.length || !reoonApiKey.trim() || isRunning}
                onClick={() => void runFinder()}
              >
                {isRunning ? "Running..." : "Run email finder"}
              </Button>
            </div>
            {error ? <p className="text-sm text-red-500">{error}</p> : null}
          </CardContent>
        </Card>

        {(isRunning || current > 0) && <ProgressStep current={current} total={total} activeName={activeName} />}

        {results.length > 0 && <ResultsTable results={results} />}
      </div>
    </main>
  );
}
