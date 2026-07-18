"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import MapboxGeocoder from "@mapbox/mapbox-gl-geocoder";
import { reverseGeocode } from "@/lib/reverseGeocode";
import type { LocationValue } from "@/types";

import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

type PickerMode = "search" | "gps" | "coords" | "gmaps";

interface LocationPickerProps {
  value?: LocationValue | null;
  onChange: (value: LocationValue | null) => void;
  allowClear?: boolean;
}

export default function LocationPicker({
  value,
  onChange,
  allowClear = false,
}: LocationPickerProps) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);

  const [mode, setMode] = useState<PickerMode>("search");
  const [latInput, setLatInput] = useState("");
  const [lngInput, setLngInput] = useState("");
  const [gmapsUrl, setGmapsUrl] = useState("");

  function setMarker(lng: number, lat: number) {
    if (!mapRef.current) return;
    if (markerRef.current) markerRef.current.remove();

    markerRef.current = new mapboxgl.Marker()
      .setLngLat([lng, lat])
      .addTo(mapRef.current);

    mapRef.current.flyTo({ center: [lng, lat], zoom: 12 });
  }

  function clearMarker() {
    markerRef.current?.remove();
    markerRef.current = null;
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [78.4867, 17.385],
      zoom: 5,
    });

    mapRef.current = map;

    map.on("load", () => {
      map.resize();
      setTimeout(() => map.resize(), 300);
    });

    const geocoder = new MapboxGeocoder({
      accessToken: mapboxgl.accessToken || undefined,
      mapboxgl,
      countries: "IN",
      placeholder: "Search location",
    });

    map.addControl(geocoder, "top-left");

    geocoder.on("result", (e) => {
      const result = e.result;
      const [lng, lat] = result.center;
      setMarker(lng, lat);
      onChange({
        lat,
        lng,
        place_name: result.place_name,
        source: "mapbox_search",
        raw: result,
      });
    });

    map.on("click", async (e) => {
      const { lng, lat } = e.lngLat;
      setMarker(lng, lat);

      const geo = await reverseGeocode(lat, lng);
      onChange({
        lat,
        lng,
        place_name: geo?.features?.[0]?.place_name ?? null,
        source: "map_click",
        raw: geo,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    if (value?.lat == null || value?.lng == null) {
      clearMarker();
      return;
    }

    setMarker(value.lng, value.lat);
    setLatInput(String(value.lat));
    setLngInput(String(value.lng));
  }, [value?.lat, value?.lng]);

  function useMyLocation() {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setMarker(lng, lat);

        const geo = await reverseGeocode(lat, lng);

        onChange({
          lat,
          lng,
          place_name: geo?.features?.[0]?.place_name ?? null,
          source: "device_gps",
          raw: geo,
        });
      },
      () => alert("Location permission denied"),
    );
  }

  function applyCoordinates() {
    const lat = Number(latInput);
    const lng = Number(lngInput);
    if (isNaN(lat) || isNaN(lng)) {
      alert("Invalid coordinates");
      return;
    }
    setMarker(lng, lat);
    onChange({
      lat,
      lng,
      source: "manual_coordinates",
    });
  }

  function applyGoogleMapsUrl() {
    const match = gmapsUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (!match) {
      alert("Invalid Google Maps URL");
      return;
    }

    const lat = Number(match[1]);
    const lng = Number(match[2]);
    setMarker(lng, lat);

    onChange({
      lat,
      lng,
      source: "google_maps_url",
      raw_url: gmapsUrl,
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-sm">
        {(
          [
            ["search", "Search"],
            ["gps", "My location"],
            ["coords", "Coordinates"],
            ["gmaps", "Google Maps URL"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setMode(k)}
            className={`px-3 py-1 rounded border ${
              mode === k ? "bg-black text-white" : "bg-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "gps" ? (
        <button
          type="button"
          onClick={useMyLocation}
          className="text-sm text-blue-600"
        >
          Use my current location
        </button>
      ) : null}

      {mode === "coords" ? (
        <div className="flex gap-2">
          <input
            placeholder="Latitude"
            className="border px-2 py-1 rounded w-1/2"
            value={latInput}
            onChange={(e) => setLatInput(e.target.value)}
          />
          <input
            placeholder="Longitude"
            className="border px-2 py-1 rounded w-1/2"
            value={lngInput}
            onChange={(e) => setLngInput(e.target.value)}
          />
          <button
            type="button"
            onClick={applyCoordinates}
            className="text-sm text-blue-600"
          >
            Set
          </button>
        </div>
      ) : null}

      {mode === "gmaps" ? (
        <div className="flex gap-2">
          <input
            placeholder="Paste Google Maps URL"
            className="border px-2 py-1 rounded w-full"
            value={gmapsUrl}
            onChange={(e) => setGmapsUrl(e.target.value)}
          />
          <button
            type="button"
            onClick={applyGoogleMapsUrl}
            className="text-sm text-blue-600"
          >
            Set
          </button>
        </div>
      ) : null}

      <div ref={containerRef} className="relative isolate w-full h-[300px] overflow-hidden rounded border" />

      {value?.lat != null && value?.lng != null ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-gray-600">
            {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
            {value.place_name ? ` — ${value.place_name}` : ""}
          </p>
          {allowClear ? (
            <button
              type="button"
              onClick={() => {
                clearMarker();
                setLatInput("");
                setLngInput("");
                setGmapsUrl("");
                onChange(null);
              }}
              className="text-xs text-red-600 hover:underline"
            >
              Clear location
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
