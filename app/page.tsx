"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { Info, Lock } from "lucide-react";

import { FileDropzone } from "@/components/FileDropzone";
import { ProgressStep } from "@/components/ProgressStep";
import { ResultsTable } from "@/components/ResultsTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import type { EmailResult, LeadInput } from "@/lib/types";

export default function Home() {
  const [leads, setLeads] = useState<LeadInput[]>([]);
  const [reoonApiKey, setReoonApiKey] = useState("");
  const [results, setResults] = useState<EmailResult[]>([]);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);
  const [activeName, setActiveName] = useState("");
  const [activeLeadDetail, setActiveLeadDetail] = useState("");
  const [verifiedCount, setVerifiedCount] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState("");
  const [isApiKeyInfoOpen, setIsApiKeyInfoOpen] = useState(false);
  const [isSecondPass, setIsSecondPass] = useState(false);
  const apiKeyInfoId = useId();
  const resultsRef = useRef<Map<string, EmailResult>>(new Map());
  const stepState = useMemo(
    () => ({
      upload: leads.length > 0,
      key: reoonApiKey.trim().length > 0,
      run: isRunning,
      results: results.length > 0,
    }),
    [isRunning, leads.length, reoonApiKey, results.length],
  );

  const processStream = useCallback(async (response: Response) => {
    if (!response.body) {
      throw new Error("Response body is empty.");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const chunks = buffer.split("\n\n");
      buffer = chunks.pop()!;

      for (const chunk of chunks) {
        if (!chunk.trim()) continue;
        const lines = chunk.split("\n");
        let event = "";
        let data = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) event = line.slice(7);
          else if (line.startsWith("data: ")) data = line.slice(6);
        }
        if (!event || !data) continue;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let parsed: any;
        try {
          parsed = JSON.parse(data);
        } catch {
          console.warn("[processStream] Skipping malformed SSE data:", data);
          continue;
        }

        if (event === "start") {
          setTotal(parsed.total);
        } else if (event === "progress") {
          setCurrent(parsed.current);
          setActiveName(`Processing lead ${parsed.current}/${parsed.total}`);
          setActiveLeadDetail(parsed.name);
        } else if (event === "result") {
          const r = parsed as EmailResult;
          resultsRef.current.set(`${r.name}\0${r.company}`, r);
          setResults([...resultsRef.current.values()]);
          if (r.status === "valid" || r.status === "safe_to_send") {
            setVerifiedCount((prev) => prev + 1);
          }
        } else if (event === "second_pass_start") {
          setIsSecondPass(true);
          setCurrent(0);
          setTotal(parsed.count);
          setActiveName("Second pass — retrying with extended patterns");
        } else if (event === "complete") {
          const allResults = parsed.results as EmailResult[];
          for (const r of allResults) {
            resultsRef.current.set(`${r.name}\0${r.company}`, r);
          }
          setResults([...resultsRef.current.values()]);
        } else if (event === "error") {
          throw new Error(parsed.message);
        }
      }
    }
  }, []);

  async function runFinder() {
    setIsRunning(true);
    setError("");
    setResults([]);
    setCurrent(0);
    setTotal(leads.length);
    setActiveName("Starting...");
    setActiveLeadDetail("");
    setVerifiedCount(0);
    setIsSecondPass(false);
    resultsRef.current = new Map();

    try {
      const response = await fetch("/api/find-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads, reoonApiKey }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to start processing.");
      }

      await processStream(response);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unexpected error.");
    } finally {
      setIsRunning(false);
      setCurrent(0);
      setTotal(0);
      setActiveName("");
      setActiveLeadDetail("");
      setIsSecondPass(false);
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
        <div className="space-y-1 sm:space-y-2">
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">Email Finder</p>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
            Find verified emails for $0.001 each.
          </h1>
          <p className="text-sm text-zinc-500">50–100× cheaper than Apollo.</p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-zinc-200 text-xs sm:text-sm">
          <div className="min-w-[260px]">
            <div className="grid grid-cols-3 border-b border-zinc-200 px-4 py-2.5 text-xs font-medium text-zinc-400">
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
                <div key={label} className="grid grid-cols-3 px-4 py-3">
                  <span className="text-zinc-500">{label}</span>
                  <span className="text-zinc-400">{apollo}</span>
                  <span className="font-medium text-zinc-800">{ours}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-zinc-200 px-4 py-2.5 text-xs text-zinc-400">
            Powered by{" "}
            <a href="https://reoon.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-600">
              Reoon
            </a>{" "}
            — BYOK, pay per use.
          </div>
        </div>

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

        {(isRunning || current > 0) && (
          <ProgressStep
            current={current}
            total={total}
            activeName={activeName}
            activeLeadDetail={activeLeadDetail}
            verifiedCount={verifiedCount}
            isSecondPass={isSecondPass}
          />
        )}

        {results.length > 0 && <ResultsTable results={results} />}
      </div>
    </main>
  );
}
