import { format } from "date-fns";
import { BellRing, Mail, MessageSquare, Webhook, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/dashboard/page-header";
import { SeverityBadge } from "@/components/reports/badges";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { resolveMunicipalityId } from "@/server/services/municipality";

export const metadata: Metadata = { title: "Alerts" };
export const dynamic = "force-dynamic";

const CHANNEL_ICON: Record<string, LucideIcon> = {
  IN_APP: BellRing,
  EMAIL: Mail,
  SMS: MessageSquare,
  WEBHOOK: Webhook,
};

export default async function AlertsPage() {
  const user = await requireUser({ staff: true });
  const municipalityId = await resolveMunicipalityId(user);
  const config = env();
  const alerts = await prisma.notification.findMany({
    where: { municipalityId, userId: null },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { report: { select: { id: true, refCode: true, status: true } } },
  });

  const channels = [
    { name: "In-app", icon: BellRing, enabled: true, detail: "Always on for staff" },
    {
      name: "Email",
      icon: Mail,
      enabled: !!config.NOTIFY_EMAIL_TO,
      detail: config.NOTIFY_EMAIL_TO ? `Mock transport → ${config.NOTIFY_EMAIL_TO}` : "Set NOTIFY_EMAIL_TO",
    },
    {
      name: "SMS",
      icon: MessageSquare,
      enabled: !!config.NOTIFY_SMS_TO,
      detail: config.NOTIFY_SMS_TO ? "Mock transport (logged)" : "Set NOTIFY_SMS_TO",
    },
    {
      name: "Webhook / Slack",
      icon: Webhook,
      enabled: !!config.NOTIFY_WEBHOOK_URL,
      detail: config.NOTIFY_WEBHOOK_URL ? "Posting to configured URL" : "Set NOTIFY_WEBHOOK_URL",
    },
  ];

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Urgent alerts"
        description={`Raised automatically when priority reaches ${config.URGENT_PRIORITY_THRESHOLD} or severity is critical.`}
      />

      <section aria-label="Channels" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {channels.map((c) => (
          <Card key={c.name} className="p-4">
            <div className="flex items-center justify-between">
              <c.icon className="text-muted-foreground size-5" aria-hidden />
              <Badge
                variant="plain"
                className={
                  c.enabled
                    ? "bg-emerald-50 text-emerald-800 ring-emerald-600/25"
                    : "bg-slate-100 text-slate-600 ring-slate-400/25"
                }
              >
                {c.enabled ? "Active" : "Off"}
              </Badge>
            </div>
            <p className="mt-3 text-sm font-medium">{c.name}</p>
            <p className="text-muted-foreground truncate text-xs" title={c.detail}>
              {c.detail}
            </p>
          </Card>
        ))}
      </section>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Alert log</CardTitle>
          <CardDescription>Delivery status per channel (most recent 100)</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {alerts.length === 0 ? (
            <p className="text-muted-foreground px-5 py-10 text-center text-sm">No alerts yet.</p>
          ) : (
            <ul className="divide-y border-t">
              {alerts.map((a) => {
                const Icon = CHANNEL_ICON[a.channel] ?? BellRing;
                return (
                  <li key={a.id} className="flex items-start gap-3 px-5 py-3">
                    <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-label={a.channel} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {a.report ? (
                          <Link
                            href={`/dashboard/reports/${a.report.id}`}
                            className="hover:text-primary text-sm font-medium"
                          >
                            {a.title}
                          </Link>
                        ) : (
                          <span className="text-sm font-medium">{a.title}</span>
                        )}
                        {a.severity && <SeverityBadge severity={a.severity} />}
                      </div>
                      <p className="text-muted-foreground text-sm">{a.body}</p>
                      {a.error && <p className="text-xs text-red-700">Delivery failed: {a.error}</p>}
                    </div>
                    <div className="text-muted-foreground shrink-0 text-right text-xs">
                      <div>{format(a.createdAt, "d MMM, HH:mm")}</div>
                      <div
                        className={
                          a.status === "FAILED"
                            ? "font-medium text-red-700"
                            : a.status === "SENT"
                              ? "text-[#006300]"
                              : undefined
                        }
                      >
                        {a.status.toLowerCase()}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
