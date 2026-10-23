"use client";

import { ArrowLeft, ArrowRight, Loader2, MapPin, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CategoryIcon } from "@/components/reports/category-icon";
import { Button } from "@/components/ui/button";
import { compressImage, extractVideoFrame } from "@/lib/client-media";
import { ROAD_TYPE_META, TRAFFIC_META } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { StepCategory } from "./step-category";
import { StepDetails } from "./step-details";
import { StepLocation } from "./step-location";
import { StepMedia } from "./step-media";
import type { DetectionSuggestion, MediaItem, WizardCategory, WizardState } from "./types";

const STEPS = [
  { key: "media", title: "Photo", heading: "Show us the problem" },
  { key: "category", title: "Issue", heading: "What kind of issue is it?" },
  { key: "location", title: "Location", heading: "Where is it?" },
  { key: "details", title: "Details", heading: "Describe it" },
  { key: "review", title: "Review", heading: "Review and submit" },
] as const;

const INITIAL: WizardState = {
  media: [],
  detection: null,
  detectionStatus: "idle",
  categorySlug: null,
  location: null,
  address: "",
  roadType: "UNKNOWN",
  trafficLevel: "UNKNOWN",
  title: "",
  description: "",
  notes: "",
};

let idCounter = 0;

export function ReportWizard({
  categories,
  center,
}: {
  categories: WizardCategory[];
  center: [number, number];
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(INITIAL);
  const [errors, setErrors] = useState<Partial<Record<"title" | "description", string>>>({});
  const [progress, setProgress] = useState<number | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleTouched = useRef(false);
  const update = useCallback((patch: Partial<WizardState>) => setState((s) => ({ ...s, ...patch })), []);

  // Release object URLs on unmount.
  const mediaRef = useRef(state.media);
  useEffect(() => {
    mediaRef.current = state.media;
  }, [state.media]);
  useEffect(
    () => () =>
      mediaRef.current.forEach((m) => {
        URL.revokeObjectURL(m.previewUrl);
        if (m.posterUrl) URL.revokeObjectURL(m.posterUrl);
      }),
    [],
  );

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const category = categories.find((c) => c.slug === state.categorySlug) ?? null;

  const runDetection = useCallback(
    async (media: MediaItem[]) => {
      const source = media.find((m) => m.kind === "image")?.file ?? media.find((m) => m.poster)?.poster;
      if (!source) return;
      update({ detectionStatus: "running" });
      try {
        const form = new FormData();
        form.append("file", source, "analysis.jpg");
        const res = await fetch("/api/detect", { method: "POST", body: form });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
        const detection = (await res.json()) as DetectionSuggestion;
        setState((s) => ({
          ...s,
          detection,
          detectionStatus: "done",
          // Pre-select the AI suggestion unless the citizen already chose.
          categorySlug: s.categorySlug ?? (detection.categoryName ? detection.label : null),
        }));
      } catch {
        update({ detectionStatus: "error" });
      }
    },
    [update],
  );

  async function addFiles(files: File[]) {
    const items: MediaItem[] = [];
    for (const raw of files) {
      const kind = raw.type.startsWith("video/") ? "video" : "image";
      if (kind === "video" && raw.size > 50 * 1024 * 1024) {
        toast.error(`${raw.name} is larger than 50 MB`);
        continue;
      }
      const file = kind === "image" ? await compressImage(raw) : raw;
      if (kind === "image" && file.size > 10 * 1024 * 1024) {
        toast.error(`${raw.name} is larger than 10 MB`);
        continue;
      }
      const poster = kind === "video" ? await extractVideoFrame(raw) : null;
      items.push({
        id: `m${++idCounter}`,
        file,
        kind,
        previewUrl: URL.createObjectURL(file),
        poster,
        posterUrl: poster ? URL.createObjectURL(poster) : null,
      });
    }
    if (!items.length) return;
    const next = [...state.media, ...items].slice(0, 4);
    const hadAnalysable = state.media.some((m) => m.kind === "image" || m.poster);
    update({ media: next });
    if (!hadAnalysable) runDetection(next);
  }

  function removeFile(id: string) {
    const target = state.media.find((m) => m.id === id);
    if (target) {
      URL.revokeObjectURL(target.previewUrl);
      if (target.posterUrl) URL.revokeObjectURL(target.posterUrl);
    }
    const next = state.media.filter((m) => m.id !== id);
    const wasPrimary =
      (state.media.find((m) => m.kind === "image") ?? state.media.find((m) => m.poster))?.id === id;
    update({ media: next, ...(next.length === 0 ? { detection: null, detectionStatus: "idle" } : {}) });
    if (wasPrimary && next.length) runDetection(next);
  }

  function chooseCategory(slug: string) {
    const c = categories.find((x) => x.slug === slug)!;
    setState((s) => ({
      ...s,
      categorySlug: slug,
      title: titleTouched.current && s.title ? s.title : c.name,
    }));
  }

  const canContinue = [state.media.length > 0, !!state.categorySlug, !!state.location, true, true][step];

  function validateDetails(): boolean {
    const e: typeof errors = {};
    if (state.title.trim().length < 4) e.title = "Add a short title (at least 4 characters).";
    if (state.description.trim().length < 10)
      e.description = "Please describe the issue in at least 10 characters.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function next() {
    if (step === 3 && !validateDetails()) return;
    if (step === 1 && !titleTouched.current && category && !state.title) update({ title: category.name });
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function submit() {
    if (!state.location || !state.categorySlug) return;
    const form = new FormData();
    for (const m of state.media) form.append("media", m.file, m.file.name);
    const poster = state.media.find((m) => m.poster)?.poster;
    if (poster && !state.media.some((m) => m.kind === "image")) form.append("poster", poster, "poster.jpg");
    form.append("categorySlug", state.categorySlug);
    form.append("title", state.title);
    form.append("description", state.description);
    if (state.notes) form.append("notes", state.notes);
    form.append("latitude", String(state.location.latitude));
    form.append("longitude", String(state.location.longitude));
    if (state.location.accuracy) form.append("accuracyM", String(Math.round(state.location.accuracy)));
    if (state.address) form.append("address", state.address);
    form.append("roadType", state.roadType);
    form.append("trafficLevel", state.trafficLevel);

    // XHR rather than fetch so we can show upload progress on slow mobile connections.
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/reports");
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 90));
    xhr.onload = () => {
      let data: { id?: string; error?: string; fieldErrors?: Record<string, string[]> } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // Non-JSON error page.
      }
      if (xhr.status === 201 && data.id) {
        setProgress(100);
        router.push(`/report/submitted/${data.id}`);
        return;
      }
      setProgress(null);
      if (xhr.status === 401) {
        toast.error("Your session expired. Please sign in again.");
        router.push("/login?callbackUrl=/report");
        return;
      }
      const fe = data.fieldErrors ?? {};
      if (fe.title || fe.description) {
        setErrors({ title: fe.title?.[0], description: fe.description?.[0] });
        setStep(3);
      } else if (fe.latitude) setStep(2);
      toast.error(data.error ?? "We couldn't submit your report. Please try again.");
    };
    xhr.onerror = () => {
      setProgress(null);
      toast.error("Network error — check your connection and try again.");
    };
    setProgress(2);
    xhr.send(form);
  }

  const submitting = progress !== null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pt-6 pb-28 sm:px-6 sm:pb-10">
      <nav aria-label="Progress" className="mb-6">
        <ol className="flex items-center gap-1.5">
          {STEPS.map((s, i) => (
            <li key={s.key} className="flex-1">
              <button
                type="button"
                disabled={i > step || submitting}
                onClick={() => setStep(i)}
                className="group w-full text-left disabled:cursor-default"
                aria-current={i === step ? "step" : undefined}
              >
                <span
                  className={cn(
                    "block h-1.5 rounded-full transition-colors",
                    i <= step ? "bg-primary" : "bg-border",
                  )}
                />
                <span
                  className={cn(
                    "mt-1.5 hidden text-xs font-medium sm:block",
                    i === step ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {i + 1}. {s.title}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <p className="text-muted-foreground mt-2 text-xs sm:hidden">
          Step {step + 1} of {STEPS.length} · {STEPS[step].title}
        </p>
      </nav>

      <h1 ref={headingRef} tabIndex={-1} className="mb-5 text-2xl font-semibold tracking-tight outline-none">
        {STEPS[step].heading}
      </h1>

      <div className="animate-fade-in flex-1" key={step}>
        {step === 0 && (
          <StepMedia
            media={state.media}
            detection={state.detection}
            detectionStatus={state.detectionStatus}
            categories={categories}
            onAdd={addFiles}
            onRemove={removeFile}
            onRetryDetection={() => runDetection(state.media)}
          />
        )}
        {step === 1 && (
          <StepCategory
            categories={categories}
            value={state.categorySlug}
            detection={state.detection}
            onChange={chooseCategory}
          />
        )}
        {step === 2 && (
          <StepLocation
            location={state.location}
            address={state.address}
            roadType={state.roadType}
            trafficLevel={state.trafficLevel}
            center={center}
            onLocation={(location) => update({ location })}
            onAddress={(address) => update({ address })}
            onRoadType={(roadType) => update({ roadType })}
            onTraffic={(trafficLevel) => update({ trafficLevel })}
          />
        )}
        {step === 3 && (
          <StepDetails
            title={state.title}
            description={state.description}
            notes={state.notes}
            errors={errors}
            onChange={(field, value) => {
              if (field === "title") titleTouched.current = true;
              update({ [field]: value });
              if (field !== "notes" && errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
            }}
          />
        )}
        {step === 4 && category && state.location && (
          <div className="flex flex-col gap-4">
            <div className="bg-card overflow-hidden rounded-2xl border">
              <div className="flex gap-3 overflow-x-auto p-3">
                {state.media.map((m) => (
                  <img
                    key={m.id}
                    src={m.kind === "image" ? m.previewUrl : (m.posterUrl ?? "")}
                    alt=""
                    className="h-24 w-32 shrink-0 rounded-lg bg-slate-900 object-cover"
                  />
                ))}
              </div>
              <dl className="divide-y border-t text-sm">
                <div className="flex items-center gap-3 px-4 py-3">
                  <CategoryIcon icon={category.icon} color={category.color} size="sm" />
                  <div>
                    <dt className="sr-only">Category</dt>
                    <dd className="font-medium">{category.name}</dd>
                    {state.detection?.categoryName && (
                      <dd className="text-muted-foreground text-xs">
                        {state.detection.label === category.slug
                          ? "Matches AI suggestion"
                          : `AI suggested ${state.detection.categoryName} — you chose otherwise`}
                      </dd>
                    )}
                  </div>
                </div>
                <div className="px-4 py-3">
                  <dt className="text-muted-foreground text-xs">Title</dt>
                  <dd className="font-medium">{state.title}</dd>
                  <dd className="text-muted-foreground mt-1 whitespace-pre-line">{state.description}</dd>
                </div>
                <div className="flex items-start gap-2 px-4 py-3">
                  <MapPin className="text-primary mt-0.5 size-4" aria-hidden />
                  <div>
                    <dt className="sr-only">Location</dt>
                    <dd>
                      {state.address ||
                        `${state.location.latitude.toFixed(5)}, ${state.location.longitude.toFixed(5)}`}
                    </dd>
                    <dd className="text-muted-foreground text-xs">
                      {ROAD_TYPE_META[state.roadType].label} · {TRAFFIC_META[state.trafficLevel].label}{" "}
                      traffic
                    </dd>
                  </div>
                </div>
                {state.notes && (
                  <div className="px-4 py-3">
                    <dt className="text-muted-foreground text-xs">Notes</dt>
                    <dd className="whitespace-pre-line">{state.notes}</dd>
                  </div>
                )}
              </dl>
            </div>
            <p className="text-muted-foreground text-xs">
              Photos are stripped of embedded metadata. Your name and contact details are visible only to city
              staff.
            </p>
            {submitting && (
              <div aria-live="polite">
                <div className="bg-muted h-2 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-muted-foreground mt-1.5 text-xs">
                  {progress! < 90 ? `Uploading… ${progress}%` : "Analysing and checking for duplicates…"}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-card/95 fixed inset-x-0 bottom-0 z-[600] border-t p-3 backdrop-blur sm:static sm:mt-8 sm:border-0 sm:bg-transparent sm:p-0">
        <div className="mx-auto flex max-w-2xl gap-3">
          {step > 0 && (
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setStep((s) => s - 1)}
              disabled={submitting}
            >
              <ArrowLeft className="!size-5" /> <span className="sr-only sm:not-sr-only">Back</span>
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button type="button" size="lg" className="flex-1" onClick={next} disabled={!canContinue}>
              Continue <ArrowRight className="!size-5" />
            </Button>
          ) : (
            <Button type="button" size="lg" className="flex-1" onClick={submit} disabled={submitting}>
              {submitting ? <Loader2 className="!size-5 animate-spin" /> : <Send className="!size-5" />}{" "}
              Submit report
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
