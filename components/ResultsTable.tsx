"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { EmailResult } from "@/lib/types";

const PAGE_SIZE = 25;

function statusVariant(status: string) {
  if (status === "valid" || status === "safe_to_send") {
    return "success" as const;
  }
  if (status === "catchall") {
    return "warning" as const;
  }
  return "secondary" as const;
}

function escapeCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

export function ResultsTable({ results }: { results: EmailResult[] }) {
  const [page, setPage] = useState(1);

  const validResults = useMemo(
    () => results.filter((result) => result.status === "valid"),
    [results],
  );

  const validCsv = useMemo(() => {
    const lines = [
      ["first_name", "last_name", "company", "email"].map(escapeCell).join(","),
      ...validResults.map((row) => {
        const { firstName, lastName } = splitName(row.name);
        return [firstName, lastName, row.company, row.email].map(escapeCell).join(",");
      }),
    ];
    return lines.join("\n");
  }, [validResults]);

  const foundCount = results.filter((result) => result.email).length;
  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageResults = results.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function downloadValidCsv() {
    const blob = new Blob([validCsv], { type: "text/csv;charset=utf-8;" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = "email-finder-valid-emails.csv";
    link.click();
    URL.revokeObjectURL(href);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Results</CardTitle>
        <CardDescription>
          {foundCount} of {results.length} leads returned a verified email.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-zinc-500">{validResults.length} rows eligible for export.</p>
          <Button variant="outline" onClick={downloadValidCsv} disabled={!validResults.length}>
            Export valid emails
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageResults.map((row) => (
              <TableRow key={`${row.name}-${row.company}`}>
                <TableCell className="font-medium text-zinc-900">{row.name}</TableCell>
                <TableCell>{row.company}</TableCell>
                <TableCell>{row.email || "—"}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between gap-4">
          <Button
            variant="outline"
            onClick={() => setPage((currentValue) => Math.max(1, currentValue - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          <p className="text-sm text-zinc-500">
            Page {currentPage} of {totalPages}
          </p>
          <Button
            variant="outline"
            onClick={() => setPage((currentValue) => Math.min(totalPages, currentValue + 1))}
            disabled={currentPage === totalPages}
          >
            Next
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
