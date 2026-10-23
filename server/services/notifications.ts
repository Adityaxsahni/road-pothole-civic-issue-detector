import "server-only";
import type { NotificationChannel, Severity } from "@prisma/client";
import { prisma } from "../db";
import { env } from "../env";

interface AlertPayload {
  reportId: string;
  refCode: string;
  municipalityId: string;
  title: string;
  categoryName: string;
  severity: Severity;
  priorityScore: number;
  address: string | null;
  latitude: number;
  longitude: number;
}

const appUrl = () => process.env.NEXTAUTH_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

async function record(
  channel: NotificationChannel,
  payload: AlertPayload,
  title: string,
  body: string,
  send: () => Promise<void>,
) {
  const n = await prisma.notification.create({
    data: {
      channel,
      title,
      body,
      severity: payload.severity,
      reportId: payload.reportId,
      municipalityId: payload.municipalityId,
    },
  });
  try {
    await send();
    await prisma.notification.update({ where: { id: n.id }, data: { status: "SENT", sentAt: new Date() } });
  } catch (err) {
    await prisma.notification.update({
      where: { id: n.id },
      data: { status: "FAILED", error: (err as Error).message.slice(0, 500) },
    });
  }
}

/**
 * Fan an urgent-issue alert out to every configured channel. In-app alerts are always recorded;
 * email/SMS are mock transports that log (swap in SES/Twilio in production); the webhook posts
 * a Slack-compatible payload when NOTIFY_WEBHOOK_URL is set.
 */
export async function raiseUrgentAlert(payload: AlertPayload): Promise<void> {
  const config = env();
  const link = `${appUrl()}/dashboard/reports/${payload.reportId}`;
  const title = `Urgent: ${payload.categoryName} (${payload.refCode})`;
  const body = `${payload.title} — priority ${Math.round(payload.priorityScore)}/100, severity ${payload.severity.toLowerCase()}${
    payload.address ? ` at ${payload.address}` : ""
  }.`;

  const jobs: Promise<void>[] = [record("IN_APP", payload, title, body, async () => {})];

  const emails = config.NOTIFY_EMAIL_TO.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (emails.length) {
    jobs.push(
      record("EMAIL", payload, title, body, async () => {
        console.info(`[notify:email] to=${emails.join(";")} subject="${title}" body="${body} ${link}"`);
      }),
    );
  }
  const phones = config.NOTIFY_SMS_TO.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (phones.length) {
    jobs.push(
      record("SMS", payload, title, body, async () => {
        console.info(`[notify:sms] to=${phones.join(";")} text="${title}: ${link}"`);
      }),
    );
  }
  if (config.NOTIFY_WEBHOOK_URL) {
    const url = config.NOTIFY_WEBHOOK_URL;
    jobs.push(
      record("WEBHOOK", payload, title, body, async () => {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: AbortSignal.timeout(5000),
          body: JSON.stringify({
            text: `:rotating_light: *${title}*\n${body}\n<${link}|Open in CivicPulse>`,
            report: {
              id: payload.reportId,
              refCode: payload.refCode,
              severity: payload.severity,
              priority: payload.priorityScore,
              location: { lat: payload.latitude, lng: payload.longitude },
              url: link,
            },
          }),
        });
        if (!res.ok) throw new Error(`Webhook responded ${res.status}`);
      }),
    );
  }
  await Promise.allSettled(jobs);
}

/** In-app status update for the citizen who filed a report. */
export async function notifyCitizen(args: { userId: string; reportId: string; title: string; body: string }) {
  await prisma.notification.create({
    data: {
      channel: "IN_APP",
      status: "SENT",
      sentAt: new Date(),
      userId: args.userId,
      reportId: args.reportId,
      title: args.title,
      body: args.body,
    },
  });
}

/** Fire-and-forget wrapper so notification failures never fail the user's request. */
export function dispatch(task: Promise<unknown>, label: string) {
  task.catch((err) => console.error(`[notify] ${label} failed:`, err));
}
