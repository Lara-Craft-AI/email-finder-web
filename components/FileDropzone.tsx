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
      const text = await file.text();
      const rows = parseCsv(text).filter((row) => row.some((cell) => cell.trim()));

      if (!rows.length) {
        throw new Error("The CSV file is empty.");
      }

      const headers = rows[0].map((cell) => cell.trim().toLowerCase());
      const firstNameIndex = headers.indexOf("first_name");
      const lastNameIndex = headers.indexOf("last_name");
      const companyIndex = headers.indexOf("company");

      if (firstNameIndex === -1 || lastNameIndex === -1 || companyIndex === -1) {
        throw new Error('CSV must include "first_name", "last_name", and "company" columns.');
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
        throw new Error("No valid rows found. Add at least one first_name, last_name, and company.");
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
        <CardDescription>Use a CSV with `first_name,last_name,company` columns.</CardDescription>
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
            isDragging ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 bg-white",
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => void handleFiles(event.target.files)}
          />
          <p className="text-sm font-medium text-zinc-900">Drag and drop your CSV here</p>
          <p className="mt-2 text-sm text-zinc-500">or choose a file from your computer</p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => inputRef.current?.click()}
          >
            Choose CSV
          </Button>
          <div className="mt-3 text-sm">
            <a href="/sample.csv" className="font-medium text-zinc-700 underline underline-offset-4 hover:text-zinc-900">
              Download sample CSV
            </a>
          </div>
        </div>
        {fileName ? <p className="text-sm text-zinc-600">Loaded: {fileName}</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
