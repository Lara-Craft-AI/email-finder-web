"use client";

import { useMemo } from "react";

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

function statusVariant(status: string) {
  if (status === "valid" || status === "safe_to_send") {
    return "success" as const;
  }
  if (status === "catchall") {
    return "warning" as const;
  }
  return "secondary" as const;
}

export function ResultsTable({ results }: { results: EmailResult[] }) {
  const csv = useMemo(() => {
    const escapeCell = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const lines = [
      ["name", "company", "email", "status"].map(escapeCell).join(","),
      ...results.map((row) =>
        [row.name, row.company, row.email, row.status].map(escapeCell).join(","),
      ),
    ];
    return lines.join("\n");
  }, [results]);

  const foundCount = results.filter((result) => result.email).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Results</CardTitle>
        <CardDescription>
          {foundCount} of {results.length} leads returned a verified email.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
            {results.map((row) => (
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
        <Button
          onClick={() => {
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            const href = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = href;
            link.download = "email-finder-results.csv";
            link.click();
            URL.revokeObjectURL(href);
          }}
        >
          Download CSV
        </Button>
      </CardContent>
    </Card>
  );
}
