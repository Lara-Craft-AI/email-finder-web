"use client";

import { useId, useMemo, useState } from "react";
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
  const [isApiKeyInfoOpen, setIsApiKeyInfoOpen] = useState(false);
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

          if (event.type === "second_pass_start") {
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
        <section className="space-y-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Email Finder</p>
            <h1 className="text-4xl font-semibold tracking-tight text-zinc-900">
              Find verified emails for <span className="text-zinc-900">$0.001 each.</span>
            </h1>
            <p className="text-base leading-7 text-zinc-500">
              Apollo charges $0.05-0.10 per email. We use SMTP verification directly - same
              accuracy, 50-100x cheaper. Upload a CSV, paste your Reoon key, download verified
              results.
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border border-zinc-200 text-sm">
            <div className="grid grid-cols-3 bg-zinc-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
              <span></span>
              <span>Apollo</span>
              <span className="text-zinc-900">Email Finder</span>
            </div>
            <div className="divide-y divide-zinc-100">
              {[
                ["Per email", "$0.05-0.10", "~$0.001"],
                ["1,000 emails", "$50-100", "~$1"],
                ["10,000 emails", "$500-1,000", "~$10"],
                ["Verification", "Bundled", "SMTP verified"],
              ].map(([label, apollo, ours]) => (
                <div key={label} className="grid grid-cols-3 px-4 py-3">
                  <span className="text-zinc-500">{label}</span>
                  <span className="text-zinc-400">{apollo}</span>
                  <span className="font-medium text-zinc-900">{ours}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-zinc-100 bg-zinc-50 px-4 py-2.5 text-xs text-zinc-400">
              Powered by{" "}
              <a
                href="https://reoon.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-zinc-600"
              >
                Reoon
              </a>{" "}
              - bring your own key, pay only for what you verify.
            </div>
          </div>
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
              className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 transition-colors hover:border-zinc-300 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 focus-visible:ring-offset-2"
            >
              <Info size={14} />
            </button>
            <div
              id={apiKeyInfoId}
              role="tooltip"
              className={`absolute top-9 right-0 w-64 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs leading-5 text-zinc-600 shadow-lg transition-all ${
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
                className="underline underline-offset-2 hover:text-zinc-900"
              >
                https://www.reoon.com/email-verifier/
              </a>{" "}
              to get an API key
            </div>
          </div>
          <CardHeader>
            <CardTitle>Reoon API key</CardTitle>
            <CardDescription className="flex items-center gap-1.5">
              <Lock size={13} className="text-zinc-400" />
              Your key is sent over HTTPS, used once to verify emails, and never stored or shared.
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
