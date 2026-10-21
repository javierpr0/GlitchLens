import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { listAudit } from "@/lib/audit";
import { requireSuperadmin } from "@/lib/auth";
import { absoluteTime } from "@/lib/format";
import { ScrollText } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit log" };

const PAGE = 100;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  await requireSuperadmin();
  const { before } = await searchParams;
  const beforeId = Number(before);
  const rows = listAudit(Number.isInteger(beforeId) && beforeId > 0 ? beforeId : undefined, PAGE + 1);
  const page = rows.slice(0, PAGE);
  const hasMore = rows.length > PAGE;

  return (
    <div>
      <PageHeader title="Audit log" description="Sign-ins and changes to users, instances and tokens. Kept for 180 days." />
      {page.length === 0 ? (
        <EmptyState icon={ScrollText} title="Nothing recorded yet" />
      ) : (
        <>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
            {page.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5">
                <span className="font-mono text-xs">{e.action}</span>
                <span className="min-w-0 truncate text-muted-foreground">{e.target}</span>
                <span className="ml-auto flex flex-wrap items-baseline gap-x-3 text-xs text-muted-foreground">
                  {e.actorEmail && <span>{e.actorEmail}</span>}
                  {e.ip && <span className="font-mono">{e.ip}</span>}
                  <span>{absoluteTime(new Date(e.at).toISOString())}</span>
                </span>
                {e.detail && <span className="basis-full break-all font-mono text-[11px] text-muted-foreground/80">{e.detail}</span>}
              </li>
            ))}
          </ul>
          {hasMore && (
            <div className="mt-4 flex justify-center">
              <Link href={`/settings/audit?before=${page[page.length - 1].id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Older events
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
