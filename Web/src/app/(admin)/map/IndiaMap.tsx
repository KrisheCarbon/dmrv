"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import type { FeatureCollection, Point } from "geojson";
import type { MapFarmPoint } from "./points";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

const INDIA_CENTER: [number, number] = [78.96, 22.59];
const INDIA_ZOOM = 4.15;

interface IndiaMapProps {
  points: MapFarmPoint[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  fitRequest: number;
}

function toCollection(points: MapFarmPoint[]): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: points.map((point) => ({
      type: "Feature",
      id: point.id,
      properties: {
        id: point.id,
        farmerName: point.farmerName,
        fieldCode: point.fieldCode,
      },
      geometry: {
        type: "Point",
        coordinates: [point.longitude, point.latitude],
      },
    })),
  };
}

function paintSelection(map: mapboxgl.Map, selectedId: string | null) {
  if (!map.getLayer("farm-points")) return;
  const selected = selectedId ?? "";
  map.setPaintProperty("farm-points", "circle-color", [
    "case",
    ["==", ["get", "id"], selected],
    "#eab308",
    "#1A3C2A",
  ]);
  map.setPaintProperty("farm-points", "circle-radius", [
    "case",
    ["==", ["get", "id"], selected],
    9,
    6,
  ]);
  map.setPaintProperty("farm-points", "circle-stroke-width", [
    "case",
    ["==", ["get", "id"], selected],
    3,
    2,
  ]);
}

export default function IndiaMap({
  points,
  selectedId,
  onSelect,
  fitRequest,
}: IndiaMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const pointsRef = useRef(points);
  const onSelectRef = useRef(onSelect);
  const selectedRef = useRef(selectedId);

  pointsRef.current = points;
  onSelectRef.current = onSelect;
  selectedRef.current = selectedId;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !mapboxgl.accessToken || mapRef.current) return;

    const map = new mapboxgl.Map({
      container,
      style: "mapbox://styles/mapbox/streets-v12",
      center: INDIA_CENTER,
      zoom: INDIA_ZOOM,
      attributionControl: false,
    });
    map.addControl(
      new mapboxgl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    map.addControl(new mapboxgl.AttributionControl({ compact: true }));
    mapRef.current = map;

    const popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 14,
    });
    popupRef.current = popup;

    map.on("load", () => {
      map.addSource("farms", {
        type: "geojson",
        data: toCollection(pointsRef.current),
        cluster: true,
        clusterMaxZoom: 12,
        clusterRadius: 48,
      });

      map.addLayer({
        id: "farm-clusters",
        type: "circle",
        source: "farms",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#1A3C2A",
          "circle-opacity": 0.92,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 40, 26],
        },
      });

      map.addLayer({
        id: "farm-cluster-count",
        type: "symbol",
        source: "farms",
        filter: ["has", "point_count"],
          layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
          "text-size": 12,
        },
        paint: { "text-color": "#ffffff" },
      });

      map.addLayer({
        id: "farm-points",
        type: "circle",
        source: "farms",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": "#1A3C2A",
          "circle-radius": 6,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      paintSelection(map, selectedRef.current);

      let handledLayerClick = false;

      map.on("click", "farm-clusters", (event) => {
        handledLayerClick = true;
        const feature = map.queryRenderedFeatures(event.point, {
          layers: ["farm-clusters"],
        })[0];
        if (!feature) return;
        const clusterId = feature.properties?.cluster_id;
        const source = map.getSource("farms") as mapboxgl.GeoJSONSource;
        const geometry = feature.geometry;
        if (geometry.type !== "Point" || clusterId == null) return;
        source.getClusterExpansionZoom(Number(clusterId), (error, zoom) => {
          if (error || zoom == null) return;
          map.easeTo({
            center: geometry.coordinates as [number, number],
            zoom,
          });
        });
      });

      map.on("click", "farm-points", (event) => {
        handledLayerClick = true;
        const id = event.features?.[0]?.properties?.id;
        if (typeof id === "string") onSelectRef.current(id);
      });

      map.on("click", () => {
        if (handledLayerClick) {
          handledLayerClick = false;
          return;
        }
        onSelectRef.current(null);
      });

      for (const layer of ["farm-clusters", "farm-points"]) {
        map.on("mouseenter", layer, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layer, () => {
          map.getCanvas().style.cursor = "";
          popup.remove();
        });
      }

      map.on("mousemove", "farm-points", (event) => {
        const feature = event.features?.[0];
        const geometry = feature?.geometry;
        if (!feature || geometry?.type !== "Point") return;
        const name = feature.properties?.farmerName || "Farm";
        const code = feature.properties?.fieldCode || "";
        popup
          .setLngLat(geometry.coordinates as [number, number])
          .setText(code ? `${name} · ${code}` : String(name))
          .addTo(map);
      });
    });

    const resize = () => map.resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    return () => {
      observer.disconnect();
      popup.remove();
      map.remove();
      mapRef.current = null;
      popupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource("farms") as mapboxgl.GeoJSONSource | undefined;
    source?.setData(toCollection(points));
  }, [points]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => paintSelection(map, selectedId);
    if (map.getLayer("farm-points")) {
      apply();
      return;
    }
    map.once("idle", apply);
    return () => {
      map.off("idle", apply);
    };
  }, [selectedId]);

  useEffect(() => {
    if (fitRequest === 0) return;
    const map = mapRef.current;
    if (!map) return;
    const current = pointsRef.current;

    const fit = () => {
      if (current.length === 0) {
        map.easeTo({ center: INDIA_CENTER, zoom: INDIA_ZOOM });
        return;
      }
      const bounds = new mapboxgl.LngLatBounds();
      for (const point of current) {
        bounds.extend([point.longitude, point.latitude]);
      }
      map.fitBounds(bounds, {
        padding: 64,
        maxZoom: current.length === 1 ? 12 : 9,
        duration: 600,
      });
    };

    if (map.isStyleLoaded()) fit();
    else map.once("load", fit);
    return () => {
      map.off("load", fit);
    };
  }, [fitRequest]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const point = pointsRef.current.find((item) => item.id === selectedId);
    if (!point) return;
    map.easeTo({
      center: [point.longitude, point.latitude],
      zoom: Math.max(map.getZoom(), 12),
      duration: 500,
    });
  }, [selectedId]);

  if (!mapboxgl.accessToken) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-gray-500">
        Map preview needs a Mapbox token.
      </div>
    );
  }

  return <div ref={containerRef} className="h-full w-full" />;
}
