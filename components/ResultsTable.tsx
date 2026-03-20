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

const PAGE_SIZE = 10;
const GRADE_ORDER = { A: 0, B: 1, C: 2 } as const;
const STATUS_ORDER: Record<string, number> = {
  valid: 0,
  safe_to_send: 0,
  catch_all: 1,
  not_found: 2,
  unresolved_domain: 3,
};

type GradeFilter = "all" | "A" | "B" | "C" | "none";

function statusVariant(status: string) {
  if (status === "valid" || status === "safe_to_send") {
    return "success" as const;
  }
  if (status === "catch_all") {
    return "warning" as const;
  }
  return "secondary" as const;
}

function gradeBadgeClass(grade: EmailResult["grade"]) {
  if (grade === "A") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (grade === "B") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-rose-200 bg-rose-50 text-rose-700";
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
  const [activeFilter, setActiveFilter] = useState<GradeFilter>("all");

  const verifiedCount = useMemo(
    () => results.filter((result) => result.status === "valid" || result.status === "safe_to_send").length,
    [results],
  );

  const gradeCounts = useMemo(() => {
    const counts = { A: 0, B: 0, C: 0, none: 0 };
    for (const r of results) {
      if (!r.email) counts.none++;
      else if (r.grade === "A") counts.A++;
      else if (r.grade === "B") counts.B++;
      else if (r.grade === "C") counts.C++;
    }
    return counts;
  }, [results]);

  const sortedResults = useMemo(() => {
    const copy = [...results];
    copy.sort((left, right) => {
      const leftStatus = STATUS_ORDER[left.status] ?? 4;
      const rightStatus = STATUS_ORDER[right.status] ?? 4;
      if (leftStatus !== rightStatus) return leftStatus - rightStatus;

      const leftGrade = left.grade ? GRADE_ORDER[left.grade] : Number.MAX_SAFE_INTEGER;
      const rightGrade = right.grade ? GRADE_ORDER[right.grade] : Number.MAX_SAFE_INTEGER;
      if (leftGrade !== rightGrade) return leftGrade - rightGrade;

      return left.name.localeCompare(right.name);
    });
    return copy;
  }, [results]);

  const filteredResults = useMemo(
    () =>
      sortedResults.filter((result) => {
        if (activeFilter === "all") {
          return true;
        }
        if (activeFilter === "none") {
          return !result.email;
        }
        return result.grade === activeFilter;
      }),
    [activeFilter, sortedResults],
  );

  const filteredCsv = useMemo(() => {
    const rowsWithEmail = filteredResults.filter((row) => row.email);
    const lines = [
      ["first_name", "last_name", "company", "email", "grade", "domain_match_risk"]
        .map(escapeCell)
        .join(","),
      ...rowsWithEmail.map((row) => {
        const { firstName, lastName } = splitName(row.name);
        return [
          firstName,
          lastName,
          row.company,
          row.email,
          row.grade ?? "",
          row.domain_match_risk ?? "",
        ]
          .map(escapeCell)
          .join(",");
      }),
    ];
    return lines.join("\n");
  }, [filteredResults]);

  const totalPages = Math.max(1, Math.ceil(filteredResults.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageResults = filteredResults.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function downloadFilteredCsv() {
    const blob = new Blob([filteredCsv], { type: "text/csv;charset=utf-8;" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = "email-finder-verified.csv";
    link.click();
    URL.revokeObjectURL(href);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Results</CardTitle>
        <CardDescription>
          {verifiedCount} of {results.length} leads returned a verified email.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {[
              { key: "all", label: `All (${results.length})` },
              { key: "A", label: `Grade A (${gradeCounts.A})` },
              { key: "B", label: `Grade B (${gradeCounts.B})` },
              { key: "C", label: `Grade C (${gradeCounts.C})` },
              { key: "none", label: `No email (${gradeCounts.none})` },
            ].map((tab) => (
              <Button
                key={tab.key}
                variant={activeFilter === tab.key ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setActiveFilter(tab.key as GradeFilter);
                  setPage(1);
                }}
              >
                {tab.label}
              </Button>
            ))}
          </div>
          <Button variant="outline" onClick={downloadFilteredCsv} disabled={!filteredResults.length}>
            Export verified emails
          </Button>
        </div>
        <p className="text-sm text-zinc-500">{filteredResults.length} rows match the active filter.</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Grade</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageResults.map((row) => (
              <TableRow key={`${row.name}\x00${row.company}`}>
                <TableCell>
                  {row.grade && (row.grade !== "C" || row.email) ? (
                    <Badge className={gradeBadgeClass(row.grade)}>{row.grade}</Badge>
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </TableCell>
                <TableCell className="font-medium text-zinc-900">{row.name}</TableCell>
                <TableCell>{row.company}</TableCell>
                <TableCell className="text-sm text-zinc-500">{row.domain || "—"}</TableCell>
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
