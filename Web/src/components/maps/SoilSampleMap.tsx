"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import { polygonCentroid, type GeoPoint } from "@krishecarbon/shared";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

// Brand values (design system §1). Chartreuse is only a fill/line on the
// satellite image here, never text.
const BRUNSWICK = "#1A3C2A";
const CHARTREUSE = "#8CC63E";
const WHITE = "#FFFFFF";

export type SoilMapFarm = { id: string; code: string; points: GeoPoint[] };

export type SoilMapPin = {
  id: string;
  /** Short text inside the pin: the point number, or "M" for the mixed sample. */
  label: string;
  /** Shown when the pin is clicked, e.g. "KOND-261010-C14-01 · Point 2". */
  title: string;
  latitude: number;
  longitude: number;
  kind: "point" | "mixed";
};

function closedRing(points: GeoPoint[]): [number, number][] {
  const ring = points.map((point) => [point.longitude, point.latitude] as [number, number]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) ring.push([...first]);
  return ring;
}

function pinElement(pin: SoilMapPin): HTMLElement {
  const el = document.createElement("button");
  el.type = "button";
  el.textContent = pin.label;
  el.setAttribute("aria-label", pin.title);
  const mixed = pin.kind === "mixed";
  Object.assign(el.style, {
    width: "28px",
    height: "28px",
    borderRadius: "999px",
    border: `2px solid ${mixed ? BRUNSWICK : WHITE}`,
    background: mixed ? CHARTREUSE : BRUNSWICK,
    color: mixed ? BRUNSWICK : WHITE,
    font: "700 13px Satoshi, system-ui, sans-serif",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 1px 4px rgba(0,0,0,0.45)",
    cursor: "pointer",
  });
  return el;
}

/**
 * Satellite map of a farmer's mapped farms with the soil sampling points on
 * top: one numbered pin per dig spot and an "M" pin where the mixed sample
 * photo was taken.
 */
export default function SoilSampleMap({
  farms,
  pins,
  className = "h-80",
}: {
  farms: SoilMapFarm[];
  pins: SoilMapPin[];
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Re-create the map only when the shapes or pins actually change.
  const key = JSON.stringify([
    farms.map((farm) => [farm.id, farm.points.map((p) => [p.longitude, p.latitude])]),
    pins.map((pin) => [pin.id, pin.label, pin.latitude, pin.longitude]),
  ]);

  useEffect(() => {
    const container = containerRef.current;
    const [farmData, pinData] = JSON.parse(key) as [
      Array<[string, [number, number][]]>,
      Array<[string, string, number, number]>,
    ];
    if (!container || !mapboxgl.accessToken) return;
    if (farmData.length === 0 && pinData.length === 0) return;

    const shapes = farms.filter((farm) => farm.points.length >= 3);
    const first = shapes[0]?.points[0] ?? pins[0];
    if (!first) return;

    const map = new mapboxgl.Map({
      container,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [first.longitude, first.latitude],
      zoom: 16,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new mapboxgl.AttributionControl({ compact: true }));

    const markers = pins.map((pin) =>
      new mapboxgl.Marker({ element: pinElement(pin) })
        .setLngLat([pin.longitude, pin.latitude])
        .setPopup(new mapboxgl.Popup({ offset: 18, closeButton: false }).setText(pin.title))
        .addTo(map),
    );

    map.on("load", () => {
      map.addSource("soil-farms", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: shapes.map((farm) => ({
            type: "Feature" as const,
            properties: { code: farm.code },
            geometry: { type: "Polygon" as const, coordinates: [closedRing(farm.points)] },
          })),
        },
      });
      map.addLayer({
        id: "soil-farms-fill",
        type: "fill",
        source: "soil-farms",
        paint: { "fill-color": CHARTREUSE, "fill-opacity": 0.22 },
      });
      map.addLayer({
        id: "soil-farms-line",
        type: "line",
        source: "soil-farms",
        paint: { "line-color": CHARTREUSE, "line-width": 2.5 },
      });
      map.addSource("soil-farm-labels", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: shapes.flatMap((farm) => {
            const centre = polygonCentroid(farm.points);
            return centre
              ? [
                  {
                    type: "Feature" as const,
                    properties: { code: farm.code },
                    geometry: {
                      type: "Point" as const,
                      coordinates: [centre.longitude, centre.latitude],
                    },
                  },
                ]
              : [];
          }),
        },
      });
      map.addLayer({
        id: "soil-farm-labels",
        type: "symbol",
        source: "soil-farm-labels",
        layout: { "text-field": ["get", "code"], "text-size": 13, "text-offset": [0, -2] },
        paint: { "text-color": WHITE, "text-halo-color": BRUNSWICK, "text-halo-width": 2 },
      });

      const bounds = new mapboxgl.LngLatBounds();
      for (const farm of shapes) for (const p of farm.points) bounds.extend([p.longitude, p.latitude]);
      for (const pin of pins) bounds.extend([pin.longitude, pin.latitude]);
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 48, maxZoom: 18, duration: 0 });
      map.resize();
    });

    return () => {
      markers.forEach((marker) => marker.remove());
      map.remove();
    };
    // `key` captures farms and pins; listing them too would rebuild on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!mapboxgl.accessToken) {
    return <p className="text-sm text-text-secondary">Map preview needs a Mapbox token.</p>;
  }
  if (farms.length === 0 && pins.length === 0) {
    return (
      <p className="text-sm text-text-secondary">
        No mapped farm boundary or GPS-tagged sample points to show.
      </p>
    );
  }
  return (
    <div
      ref={containerRef}
      className={`w-full overflow-hidden rounded-2xl border border-neutral-200 ${className}`}
    />
  );
}
