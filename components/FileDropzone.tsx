"use client";

import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/components/ui/utils";
import type { LeadInput } from "@/lib/types";

type FileDropzoneProps = {
  onLeadsParsed: (leads: LeadInput[]) => void;
};

function parseCsv(text: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  if (current || row.length) {
    row.push(current);
    rows.push(row);
  }

  return rows;
}

export function FileDropzone({ onLeadsParsed }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");

  const parseFile = useCallback(
    async (file: File) => {
      const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
      if (file.size > MAX_FILE_SIZE) {
        throw new Error("CSV file is too large. Maximum size is 10 MB.");
      }

      const text = (await file.text()).replace(/^\uFEFF/, "");
      const rows = parseCsv(text).filter((row) => row.some((cell) => cell.trim()));

      if (!rows.length) {
        throw new Error("The CSV file is empty.");
      }

      const headers = rows[0].map((cell) => cell.trim().toLowerCase());
      const firstNameIndex = headers.findIndex((h) => h.includes("first"));
      const lastNameIndex = headers.findIndex((h) => h.includes("last"));
      const companyIndex = headers.findIndex((h) => h.includes("company"));

      if (firstNameIndex === -1 || lastNameIndex === -1 || companyIndex === -1) {
        throw new Error('CSV must have columns containing "first", "last", and "company".');
      }

      const leads = rows
        .slice(1)
        .map((row) => ({
          name: [row[firstNameIndex]?.trim() ?? "", row[lastNameIndex]?.trim() ?? ""]
            .filter(Boolean)
            .join(" "),
          company: row[companyIndex]?.trim() ?? "",
        }))
        .filter((lead) => lead.name && lead.company);

      if (!leads.length) {
        throw new Error("No valid rows found. Add at least one row with first, last, and company.");
      }

      setFileName(file.name);
      setError("");
      onLeadsParsed(leads);
    },
    [onLeadsParsed],
  );

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0];
      if (!file) {
        return;
      }

      try {
        await parseFile(file);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Failed to read CSV.");
      }
    },
    [parseFile],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload your CSV</CardTitle>
        <CardDescription>
          Any CSV with columns containing &quot;first&quot;, &quot;last&quot;, and
          &quot;company&quot; works.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            void handleFiles(event.dataTransfer.files);
          }}
          className={cn(
            "rounded-lg border border-dashed p-8 text-center transition-colors",
            isDragging ? "border-zinc-500 bg-white/[0.04]" : "border-white/[0.08] bg-transparent",
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => void handleFiles(event.target.files)}
          />
          <p className="text-sm font-medium text-zinc-300">Drag and drop your CSV here</p>
          <p className="mt-2 text-sm text-zinc-600">
            Columns must include &quot;first&quot;, &quot;last&quot;, and
            &quot;company&quot; (any naming works).
          </p>
          <Button
            className="mt-4"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
          >
            Choose CSV
          </Button>
          <div className="mt-3 text-xs">
            <a href="/sample.csv" className="text-zinc-600 underline underline-offset-4 hover:text-zinc-400">
              Download sample CSV
            </a>
          </div>
        </div>
        {fileName ? <p className="text-sm text-zinc-500">Loaded: {fileName}</p> : null}
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
