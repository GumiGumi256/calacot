"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CircleCheck, ExternalLink, Eye, FileText, Flag, Folder, Grid2X2, List, Search } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { recordLabels } from "@/lib/documents/labels";
import type { DocumentRow } from "@/lib/documents/reads";
import { UploadDocument } from "./document-forms";

type Filter = "all" | "project" | "work" | "pdf" | "sheets";
const filters: { id: Filter; label: string }[] = [{ id: "all", label: "All" }, { id: "project", label: "Project files" }, { id: "work", label: "Tasks & milestones" }, { id: "pdf", label: "PDFs" }, { id: "sheets", label: "Spreadsheets" }];
function extension(d: DocumentRow) { return d.name.match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toUpperCase() || (d.mime_type === "application/pdf" ? "PDF" : "FILE"); }
function matches(d: DocumentRow, filter: Filter) {
  if (filter === "project") return d.record_type === "project";
  if (filter === "work") return ["task", "milestone"].includes(d.record_type);
  if (filter === "pdf") return d.mime_type === "application/pdf" || extension(d) === "PDF";
  if (filter === "sheets") return ["XLS", "XLSX", "CSV", "ODS"].includes(extension(d));
  return true;
}
function fileSize(value: string) { const n = Number(value); return !Number.isFinite(n) || n < 0 ? "Size unavailable" : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`; }
function dateLabel(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat("en-UG", { dateStyle: "medium", timeZone: "Africa/Kampala" }).format(date); }
function FileIdentity({ d }: { d: DocumentRow }) { return <div className="flex min-w-0 items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-card-edge bg-card-nested text-muted-foreground"><FileText className="size-5" aria-hidden="true" /></span><div className="min-w-0"><Link href={`/admin/documents/${d.id}`} className="block max-w-xs truncate font-medium hover:underline" title={d.name}>{d.name}</Link><div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><span className="rounded bg-muted px-1.5 py-0.5 font-medium">{extension(d)}</span><span>{fileSize(d.size_bytes)}</span><span aria-hidden="true">·</span><span>v{d.version}</span></div></div></div>; }
function Context({ d }: { d: DocumentRow }) { const Icon = d.record_type === "task" ? CircleCheck : d.record_type === "milestone" ? Flag : Folder; return <Badge variant="neutral" className="max-w-56"><Icon aria-hidden="true" /><span className="truncate">{d.record_type === "project" ? "Project" : `${recordLabels[d.record_type] ?? d.record_type}: ${d.record_label}`}</span></Badge>; }
function Uploader({ d }: { d: DocumentRow }) { const initials = d.uploader.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "?"; return <div className="flex items-center gap-2"><Avatar size="sm"><AvatarFallback>{initials}</AvatarFallback></Avatar><div className="min-w-0"><span className="block max-w-36 truncate" title={d.uploader}>{d.uploader}</span><span className="block text-xs text-muted-foreground">{dateLabel(d.created_at)}</span></div></div>; }
function OpenFile({ d }: { d: DocumentRow }) { return <Button variant="ghost" size="icon-sm" render={<a href={`/api/documents/${d.id}`} target="_blank" rel="noopener" aria-label={`Open ${d.name}`} />}><Eye aria-hidden="true" /></Button>; }
function DocumentCards({ rows, className = "" }: { rows: DocumentRow[]; className?: string }) {
  return <div className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-3 ${className}`}>{rows.map(d => <div key={d.root} className="min-w-0 space-y-3 rounded-(--card-radius-inner) border border-card-edge bg-card-nested p-4"><FileIdentity d={d} /><Context d={d} /><div className="flex items-center justify-between gap-2 border-t pt-3 text-sm"><Uploader d={d} /><OpenFile d={d} /></div></div>)}</div>;
}

export function ProjectDocuments({ rows, id, label, canUpload }: { rows: DocumentRow[]; id: string; label: string; canUpload: boolean }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<"list" | "grid">("list");
  const [sort, setSort] = useState("recent");
  const filtered = useMemo(() => rows.filter(d => matches(d, filter) && `${d.name} ${d.record_label}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "oldest" ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime() : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()), [rows, filter, query, sort]);
  const upload = (text: string) => canUpload && <UploadDocument fixed={{ type: "project", id, label }} triggerLabel={text} />;
  return <Card className="lg:col-span-2">
    <CardHeader><div className="flex items-center gap-2"><CardTitle>Documents</CardTitle><Badge variant="neutral">{rows.length}{rows.length === 50 ? "+" : ""}</Badge></div><CardDescription>Files linked to this project, its tasks and milestones. Only documents you may access are listed.</CardDescription></CardHeader>
    <CardContent className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        {rows.length > 0 && <><div className="relative min-w-0 flex-1 sm:w-60 sm:flex-none"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input aria-label="Filter files or linked context" placeholder="Search files..." value={query} onChange={e => setQuery(e.target.value)} className="pl-9" /></div><div className="hidden rounded-(--control-radius) border border-input p-1 sm:flex" role="group" aria-label="Document view"><Button size="sm" variant={view === "list" ? "secondary" : "ghost"} aria-pressed={view === "list"} onClick={() => setView("list")}><List /> List</Button><Button size="sm" variant={view === "grid" ? "secondary" : "ghost"} aria-pressed={view === "grid"} onClick={() => setView("grid")}><Grid2X2 /> Grid</Button></div></>}
        <Button variant="ghost" size="sm" className="hidden sm:inline-flex" render={<Link href={`/admin/documents?projectId=${id}`} />}>Open in Documents <ExternalLink aria-hidden="true" /></Button><div className="ml-auto sm:ml-0">{upload("Upload")}</div>
      </div>
      {rows.length > 0 && <div className="border-t pt-4">
        <div className="grid grid-cols-2 gap-2 sm:hidden">
          <label className="min-w-0"><span className="sr-only">Filter documents</span><NativeSelect wrapperClassName="w-full" aria-label="Filter documents" value={filter} onChange={e => setFilter(e.target.value as Filter)}>{filters.map(f => <option key={f.id} value={f.id}>{f.label} ({rows.filter(d => matches(d, f.id)).length})</option>)}</NativeSelect></label>
          <label className="min-w-0"><span className="sr-only">Sort documents</span><NativeSelect wrapperClassName="w-full" aria-label="Sort documents" value={sort} onChange={e => setSort(e.target.value)}><option value="recent">Newest first</option><option value="oldest">Oldest first</option><option value="name">File name</option></NativeSelect></label>
        </div>
        <div className="hidden flex-wrap items-center justify-between gap-3 sm:flex"><div className="flex flex-wrap gap-2" role="group" aria-label="Filter documents">{filters.map(f => <Button key={f.id} size="sm" variant={filter === f.id ? "secondary" : "ghost"} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label} <span className="text-xs tabular-nums">{rows.filter(d => matches(d, f.id)).length}</span></Button>)}</div><label className="flex items-center gap-2 text-xs text-muted-foreground">Sort by <NativeSelect aria-label="Sort documents" value={sort} onChange={e => setSort(e.target.value)}><option value="recent">Newest first</option><option value="oldest">Oldest first</option><option value="name">File name</option></NativeSelect></label></div>
      </div>}
      {!rows.length ? <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-card-edge bg-card-nested px-6 py-12 text-center"><span className="rounded-lg border border-card-edge bg-card p-3 text-muted-foreground"><Folder className="size-5" /></span><p className="font-medium">No documents yet</p><p className="max-w-sm text-sm text-muted-foreground">Upload project files to keep your documents together.</p>{upload("Upload first document")}</div> : !filtered.length ? <div className="rounded-lg border border-dashed border-card-edge p-8 text-center text-sm text-muted-foreground">No documents match your filters. <button className="font-medium text-foreground underline" onClick={() => { setQuery(""); setFilter("all"); }}>Clear filters</button></div> : view === "list" ? <><DocumentCards rows={filtered} className="sm:hidden" /><div className="hidden overflow-hidden rounded-lg border border-card-edge sm:block"><Table className="min-w-[720px]"><TableHeader className="bg-muted/50"><TableRow><TableHead className="w-[40%] px-4 text-table-head">File name</TableHead><TableHead className="w-[28%] text-table-head">Linked context</TableHead><TableHead className="w-[22%] text-table-head">Added by</TableHead><TableHead className="px-4 text-right text-table-head">Actions</TableHead></TableRow></TableHeader><TableBody>{filtered.map(d => <TableRow key={d.root}><TableCell className="px-4 py-3"><FileIdentity d={d} /></TableCell><TableCell><Context d={d} /></TableCell><TableCell><Uploader d={d} /></TableCell><TableCell className="px-4 text-right"><OpenFile d={d} /></TableCell></TableRow>)}</TableBody></Table></div></> : <DocumentCards rows={filtered} />}
      {rows.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-xs text-muted-foreground"><span>Showing {filtered.length} of {rows.length} accessible documents{rows.length === 50 ? " (most recent 50)" : ""}</span><Link className="font-medium text-foreground underline-offset-4 hover:underline" href={`/admin/documents?projectId=${id}`}>Open in Documents</Link></div>}
    </CardContent>
  </Card>;
}
