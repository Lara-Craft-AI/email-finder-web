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

type GradeFilter = "all" | "A" | "B";

const RISKY_TOOLTIP =
  "This domain accepts all emails — we cannot confirm this address exists. Use with caution.";

function statusVariant(status: string) {
  if (status === "valid" || status === "safe_to_send") {
    return "success" as const;
  }
  if (status === "catch_all") {
    return "warning" as const;
  }
  return "secondary" as const;
}

function gradeLabel(grade: EmailResult["grade"]): string | null {
  if (grade === "A") return "Verified";
  if (grade === "B" || grade === "C") return "Risky";
  return null;
}

function gradeTooltip(grade: EmailResult["grade"]): string | undefined {
  if (grade === "B" || grade === "C") return RISKY_TOOLTIP;
  return undefined;
}

function gradeBadgeClass(grade: EmailResult["grade"]) {
  if (grade === "A") {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-600";
  }
  if (grade === "B" || grade === "C") {
    return "border-amber-500/20 bg-amber-500/10 text-amber-600";
  }
  return "";
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
    const counts = { A: 0, B: 0 };
    for (const r of results) {
      if (r.grade === "A") counts.A++;
      else if (r.grade === "B") counts.B++;
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

  const filterTabs = [
    { key: "all" as const, label: "All", count: results.length },
    { key: "A" as const, label: "Verified", count: gradeCounts.A },
    { key: "B" as const, label: "Risky", count: gradeCounts.B },
  ];

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
          <div className="flex gap-1 overflow-x-auto rounded-lg border border-zinc-200 p-1">
            {filterTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setActiveFilter(tab.key);
                  setPage(1);
                }}
                className={`min-h-[36px] shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeFilter === tab.key
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-500 hover:text-zinc-700"
                }`}
              >
                {tab.label}
                <span className="ml-1.5 text-[11px] opacity-60">{tab.count}</span>
              </button>
            ))}
          </div>
          <Button className="w-full sm:w-auto" variant="outline" size="sm" onClick={downloadFilteredCsv} disabled={!filteredResults.length}>
            Export CSV
          </Button>
        </div>

        {/* Mobile card layout */}
        <div className="space-y-3 sm:hidden">
          {pageResults.map((row) => {
            const label = gradeLabel(row.grade);
            const tooltip = gradeTooltip(row.grade);
            return (
              <div key={`${row.name}\x00${row.company}`} className="rounded-lg border border-zinc-200 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-zinc-800 text-sm">{row.name}</span>
                  {label ? (
                    <span className="inline-flex items-center gap-1" title={tooltip}>
                      <Badge className={gradeBadgeClass(row.grade)}>{label}</Badge>
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-zinc-500">{row.company}</div>
                {row.email ? (
                  <div className="font-mono text-xs text-zinc-700 break-all">{row.email}</div>
                ) : (
                  <div className="text-xs text-zinc-300">No email found</div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-zinc-400">{row.domain || "—"}</span>
                  <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop table layout */}
        <div className="hidden sm:block">
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
              {pageResults.map((row) => {
                const label = gradeLabel(row.grade);
                const tooltip = gradeTooltip(row.grade);
                return (
                  <TableRow key={`${row.name}\x00${row.company}`}>
                    <TableCell>
                      {label ? (
                        <span className="inline-flex items-center gap-1" title={tooltip}>
                          <Badge className={gradeBadgeClass(row.grade)}>{label}</Badge>
                          {tooltip && (
                            <span
                              className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-amber-500/30 text-[10px] text-amber-600"
                              title={tooltip}
                            >
                              ?
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium text-zinc-800">{row.name}</TableCell>
                    <TableCell>{row.company}</TableCell>
                    <TableCell className="text-zinc-400 font-mono text-xs">{row.domain || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{row.email || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage((currentValue) => Math.max(1, currentValue - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          <p className="text-xs text-zinc-400">
            Page {currentPage} of {totalPages}
          </p>
          <Button
            variant="ghost"
            size="sm"
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
