"use client";

import { Crosshair, Loader2, MapPin } from "lucide-react";
import { useEffect } from "react";
import { LocationPicker } from "@/components/map/location-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useGeolocation } from "@/hooks/use-geolocation";
import { ROAD_TYPE_META, TRAFFIC_META } from "@/lib/constants";
import type { RoadType, TrafficLevel, WizardLocation } from "./types";

interface Props {
  location: WizardLocation | null;
  address: string;
  roadType: RoadType;
  trafficLevel: TrafficLevel;
  center: [number, number];
  onLocation: (loc: WizardLocation) => void;
  onAddress: (address: string) => void;
  onRoadType: (v: RoadType) => void;
  onTraffic: (v: TrafficLevel) => void;
}

export function StepLocation({
  location,
  address,
  roadType,
  trafficLevel,
  center,
  onLocation,
  onAddress,
  onRoadType,
  onTraffic,
}: Props) {
  const geo = useGeolocation();

  async function locateMe() {
    const fix = await geo.locate();
    if (fix) onLocation({ latitude: fix.latitude, longitude: fix.longitude, accuracy: fix.accuracy });
  }

  // Try GPS automatically the first time the step opens.
  useEffect(() => {
    if (!location) locateMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Best-effort reverse geocoding when the pin moves (no-op when disabled server-side).
  useEffect(() => {
    if (!location) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/geocode/reverse?lat=${location.latitude}&lng=${location.longitude}`, {
        signal: ctrl.signal,
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d?.address && onAddress(d.address))
        .catch(() => {});
    }, 600);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.latitude, location?.longitude]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          type="button"
          variant="outline"
          onClick={locateMe}
          disabled={geo.status === "locating"}
          className="sm:w-auto"
        >
          {geo.status === "locating" ? <Loader2 className="animate-spin" /> : <Crosshair />} Use my current
          location
        </Button>
        <p className="text-muted-foreground text-sm" aria-live="polite">
          {location ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="text-primary size-4" aria-hidden />
              {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
              {location.accuracy ? ` · ±${Math.round(location.accuracy)} m` : " · pinned manually"}
            </span>
          ) : (
            "Or tap the map to drop a pin."
          )}
        </p>
      </div>
      {geo.error && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{geo.error}</p>}

      <LocationPicker
        value={location}
        onChange={(lat, lng) => onLocation({ latitude: lat, longitude: lng, accuracy: null })}
        center={center}
        className="h-72 sm:h-80"
      />

      <div>
        <Label htmlFor="address">Address or landmark (optional)</Label>
        <Input
          id="address"
          value={address}
          maxLength={300}
          placeholder="e.g. Opposite Forum Mall, Hosur Road"
          onChange={(e) => onAddress(e.target.value)}
          className="mt-1.5"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="roadType">Type of road</Label>
          <NativeSelect
            id="roadType"
            value={roadType}
            onChange={(e) => onRoadType(e.target.value as RoadType)}
            className="mt-1.5"
          >
            {(Object.keys(ROAD_TYPE_META) as RoadType[]).map((k) => (
              <option key={k} value={k}>
                {ROAD_TYPE_META[k].label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <Label htmlFor="traffic">Traffic at this spot</Label>
          <NativeSelect
            id="traffic"
            value={trafficLevel}
            onChange={(e) => onTraffic(e.target.value as TrafficLevel)}
            className="mt-1.5"
          >
            {(Object.keys(TRAFFIC_META) as TrafficLevel[]).map((k) => (
              <option key={k} value={k}>
                {TRAFFIC_META[k].label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <p className="text-muted-foreground -mt-2 text-xs">
        Road and traffic details help the city prioritise repairs on busy routes.
      </p>
    </div>
  );
}
