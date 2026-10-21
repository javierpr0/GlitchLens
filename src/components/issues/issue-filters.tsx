"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Project } from "@/lib/glitchtip/types";
import { ChevronDown, FolderKanban, Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

const PERIODS = [
  { value: "1h", label: "Last hour" },
  { value: "24h", label: "Last 24h" },
  { value: "7d", label: "Last 7 days" },
  { value: "14d", label: "Last 14 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

const STATUS_QUERIES = [
  { value: "is:unresolved", label: "Unresolved" },
  { value: "is:resolved", label: "Resolved" },
  { value: "is:ignored", label: "Ignored" },
  { value: "", label: "All" },
];

const STORAGE_KEY = "glitchlens.issueFilters";
const PERSISTED_KEYS = new Set(["query", "project", "environment", "statsPeriod", "sort"]);

function pickPersisted(params: URLSearchParams): URLSearchParams {
  // Iterate over the known keys (not params.keys(), which yields a key once
  // per occurrence and would multiply repeated values). Dedupe values too —
  // self-heals corrupted state from a previous buggy version.
  const out = new URLSearchParams();
  for (const k of PERSISTED_KEYS) {
    const values = params.getAll(k);
    if (values.length === 0) continue;
    const unique = Array.from(new Set(values));
    for (const v of unique) out.append(k, v);
  }
  return out;
}

export function IssueFilters({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("query") ?? "");
  const restoredRef = useRef(false);

  // Sync local search when URL changes (back/forward, restore)
  const [prevParams, setPrevParams] = useState(params);
  if (params !== prevParams) {
    setPrevParams(params);
    setSearch(params.get("query") ?? "");
  }

  // On mount: if URL has no persisted filters, restore from localStorage once,
  // or fall back to Sentry's default of "is:unresolved".
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const persistedNow = pickPersisted(new URLSearchParams(params.toString()));
    if (persistedNow.toString().length > 0) return; // URL already has filters
    if (typeof window === "undefined") return;

    let saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      // Sanitize any corrupted/oversized state from previous versions.
      const cleaned = pickPersisted(new URLSearchParams(saved)).toString();
      if (cleaned !== saved) {
        localStorage.setItem(STORAGE_KEY, cleaned);
      }
      saved = cleaned;
    }

    if (saved && saved.length > 0) {
      router.replace(`/issues?${saved}`);
    } else {
      router.replace("/issues?query=is%3Aunresolved");
    }
  }, [params, router]);

  // Persist whenever URL filters change
  useEffect(() => {
    if (typeof window === "undefined") return;
    const persisted = pickPersisted(new URLSearchParams(params.toString()));
    localStorage.setItem(STORAGE_KEY, persisted.toString());
  }, [params]);

  function buildNext(mutator: (next: URLSearchParams) => void): URLSearchParams {
    const next = new URLSearchParams(params.toString());
    next.delete("cursor"); // reset paging on any filter change
    mutator(next);
    return next;
  }

  function pushNext(next: URLSearchParams) {
    router.push(`/issues?${next.toString()}`);
  }

  function setSingle(key: string, value: string | null) {
    pushNext(buildNext((next) => {
      if (value === null) next.delete(key);
      else next.set(key, value); // empty string is preserved (e.g. status="All")
    }));
  }

  function toggleProject(id: string) {
    pushNext(buildNext((next) => {
      const current = new Set(next.getAll("project"));
      if (current.has(id)) current.delete(id);
      else current.add(id);
      next.delete("project");
      for (const v of current) next.append("project", v);
    }));
  }

  function clearProjects() {
    pushNext(buildNext((next) => next.delete("project")));
  }

  function clearAll() {
    if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
    router.push("/issues");
  }

  function onSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSingle("query", search.trim() || null);
  }

  const selectedProjects = params.getAll("project");
  const activeStatus = params.get("query");
  const effectiveStatus = activeStatus === null ? "is:unresolved" : activeStatus; // default
  const activePeriod = params.get("statsPeriod") ?? "14d";

  const projectButtonLabel = (() => {
    if (selectedProjects.length === 0) return "All projects";
    if (selectedProjects.length === 1) {
      return projects.find((p) => p.id === selectedProjects[0])?.name ?? "1 project";
    }
    return `${selectedProjects.length} projects`;
  })();

  // Treat the default unresolved as "no active filter" so Clear doesn't show for it.
  const queryParam = params.get("query");
  const queryDiffersFromDefault =
    queryParam !== null && queryParam !== "is:unresolved";
  const hasAnyFilter =
    selectedProjects.length > 0 ||
    queryDiffersFromDefault ||
    !!params.get("environment") ||
    (params.get("statsPeriod") && params.get("statsPeriod") !== "14d");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form onSubmit={onSearch} className="relative w-full min-w-0 sm:flex-1 sm:max-w-lg">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search issues..."
          className="bg-card pl-9"
        />
      </form>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" size="sm" className="gap-2" />}
        >
          <FolderKanban className="h-3.5 w-3.5" />
          {projectButtonLabel}
          <ChevronDown className="h-3.5 w-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60 max-h-80 overflow-auto">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs">Filter by project</DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={clearProjects} className="gap-2 text-xs">
            <span className="flex-1">All projects</span>
            {selectedProjects.length === 0 && <span className="text-muted-foreground">·</span>}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {projects.map((p) => (
            <DropdownMenuCheckboxItem
              key={p.id}
              checked={selectedProjects.includes(p.id)}
              onCheckedChange={() => toggleProject(p.id)}
              onSelect={(e) => e.preventDefault()}
            >
              {p.name}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" size="sm" className="gap-2" />}
        >
          {STATUS_QUERIES.find((s) => s.value === effectiveStatus)?.label ?? "Status"}
          <ChevronDown className="h-3.5 w-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          {STATUS_QUERIES.map((s) => (
            <DropdownMenuCheckboxItem
              key={s.value || "all"}
              checked={effectiveStatus === s.value}
              onCheckedChange={() => {
                setSearch(s.value);
                setSingle("query", s.value); // empty string => All
              }}
            >
              {s.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" size="sm" className="gap-2" />}
        >
          {PERIODS.find((p) => p.value === activePeriod)?.label ?? "Period"}
          <ChevronDown className="h-3.5 w-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          {PERIODS.map((p) => (
            <DropdownMenuCheckboxItem
              key={p.value}
              checked={activePeriod === p.value}
              onCheckedChange={() => setSingle("statsPeriod", p.value)}
            >
              {p.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {hasAnyFilter && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearAll}
          className="gap-1 text-muted-foreground"
          title="Clear all filters"
        >
          <X className="h-3.5 w-3.5" /> Clear
        </Button>
      )}
    </div>
  );
}
