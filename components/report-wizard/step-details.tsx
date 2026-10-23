"use client";

import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  description: string;
  notes: string;
  errors: Partial<Record<"title" | "description", string>>;
  onChange: (field: "title" | "description" | "notes", value: string) => void;
}

export function StepDetails({ title, description, notes, errors, onChange }: Props) {
  const speech = useSpeechRecognition((text) => {
    onChange("description", description ? `${description.trimEnd()} ${text}` : text);
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Label htmlFor="title">Short title</Label>
        <Input
          id="title"
          value={title}
          maxLength={120}
          onChange={(e) => onChange("title", e.target.value)}
          className="mt-1.5"
          aria-invalid={!!errors.title}
          aria-describedby={errors.title ? "title-error" : undefined}
        />
        {errors.title && (
          <p id="title-error" className="text-destructive mt-1.5 text-xs font-medium">
            {errors.title}
          </p>
        )}
      </div>
      <div>
        <div className="flex items-end justify-between gap-2">
          <Label htmlFor="description">What&apos;s the problem?</Label>
          {speech.supported && (
            <Button
              type="button"
              size="sm"
              variant={speech.listening ? "destructive" : "outline"}
              onClick={speech.listening ? speech.stop : speech.start}
              aria-pressed={speech.listening}
            >
              {speech.listening ? <MicOff /> : <Mic />}
              {speech.listening ? "Stop dictation" : "Dictate"}
            </Button>
          )}
        </div>
        <Textarea
          id="description"
          value={description}
          maxLength={2000}
          rows={5}
          placeholder="Size, depth, how long it's been there, any hazard to vehicles or pedestrians…"
          onChange={(e) => onChange("description", e.target.value)}
          className={cn("mt-1.5", speech.listening && "ring-2 ring-red-500/40")}
          aria-invalid={!!errors.description}
          aria-describedby={errors.description ? "description-error" : "description-hint"}
        />
        <div className="text-muted-foreground mt-1.5 flex justify-between text-xs">
          {errors.description ? (
            <p id="description-error" className="text-destructive font-medium">
              {errors.description}
            </p>
          ) : (
            <p id="description-hint">
              {speech.listening ? "Listening… speak naturally." : (speech.error ?? "At least 10 characters.")}
            </p>
          )}
          <span className="tabular">{description.length}/2000</span>
        </div>
      </div>
      <div>
        <Label htmlFor="notes">Additional notes (optional)</Label>
        <Textarea
          id="notes"
          value={notes}
          maxLength={2000}
          rows={3}
          placeholder="Best time to inspect, nearby landmarks, accessibility concerns…"
          onChange={(e) => onChange("notes", e.target.value)}
          className="mt-1.5"
        />
      </div>
    </div>
  );
}
