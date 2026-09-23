import Constants from "expo-constants";

export function getMapboxToken(): string {
  return (Constants.expoConfig?.extra as { mapboxToken?: string } | undefined)
    ?.mapboxToken || "";
}

export async function mapboxReverseGeocode(
  latitude: number,
  longitude: number,
): Promise<string> {
  const token = getMapboxToken();

  if (!token) {
    throw new Error("Mapbox token is not configured. Set EXPO_PUBLIC_MAPBOX_TOKEN in .env");
  }

  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/` +
    `${longitude},${latitude}.json?access_token=${token}&limit=1`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Could not look up address for this location.");
  }

  const data = await response.json();
  const place = data.features?.[0]?.place_name;

  if (place) {
    return place;
  }

  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

function jsNumber(value: number | null | undefined): string {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "null";
}

/** Mapbox GL helpers: a WhatsApp-style blue dot for the person holding the phone. */
function userLocationRuntime(
  userLatitude?: number | null,
  userLongitude?: number | null,
  accuracy?: number | null,
): string {
  const lat = jsNumber(userLatitude);
  const lng = jsNumber(userLongitude);
  const acc = jsNumber(accuracy) === "null" ? "40" : jsNumber(accuracy);

  return `
      var userLng = ${lng};
      var userLat = ${lat};
      var userAcc = ${lat === "null" || lng === "null" ? "40" : acc};
      var userLocationReady = false;
      var pendingUser = null;
      var userPulseTimer = null;

      function circleRing(lng, lat, radiusMeters) {
        var steps = 48;
        var ring = [];
        var latRad = lat * Math.PI / 180;
        var metersPerDegLat = 111320;
        var metersPerDegLng = Math.max(Math.cos(latRad) * 111320, 1);
        var i;
        for (i = 0; i <= steps; i++) {
          var angle = (i / steps) * Math.PI * 2;
          ring.push([
            lng + (radiusMeters * Math.cos(angle)) / metersPerDegLng,
            lat + (radiusMeters * Math.sin(angle)) / metersPerDegLat
          ]);
        }
        return ring;
      }

      function userLocationData(lng, lat, accuracyMeters) {
        var radius = accuracyMeters && accuracyMeters > 0 ? accuracyMeters : 30;
        if (radius > 80) radius = 80;
        return {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { kind: 'accuracy' },
              geometry: { type: 'Polygon', coordinates: [circleRing(lng, lat, radius)] }
            },
            {
              type: 'Feature',
              properties: { kind: 'dot' },
              geometry: { type: 'Point', coordinates: [lng, lat] }
            }
          ]
        };
      }

      function ensureUserLocationLayers() {
        if (!map || map.getSource('user-location')) return;
        map.addSource('user-location', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });
        map.addLayer({
          id: 'user-accuracy',
          type: 'fill',
          source: 'user-location',
          filter: ['==', ['get', 'kind'], 'accuracy'],
          paint: { 'fill-color': '#2F80ED', 'fill-opacity': 0.16 }
        });
        map.addLayer({
          id: 'user-accuracy-line',
          type: 'line',
          source: 'user-location',
          filter: ['==', ['get', 'kind'], 'accuracy'],
          paint: { 'line-color': '#2F80ED', 'line-width': 1, 'line-opacity': 0.45 }
        });
        map.addLayer({
          id: 'user-dot-halo',
          type: 'circle',
          source: 'user-location',
          filter: ['==', ['get', 'kind'], 'dot'],
          paint: {
            'circle-radius': 14,
            'circle-color': '#2F80ED',
            'circle-opacity': 0.25
          }
        });
        map.addLayer({
          id: 'user-dot',
          type: 'circle',
          source: 'user-location',
          filter: ['==', ['get', 'kind'], 'dot'],
          paint: {
            'circle-radius': 7,
            'circle-color': '#1A73E8',
            'circle-stroke-width': 3,
            'circle-stroke-color': '#ffffff'
          }
        });
        if (!userPulseTimer) {
          userPulseTimer = setInterval(function () {
            if (!map.getLayer('user-dot-halo')) return;
            var wave = (Math.sin(Date.now() / 280) + 1) / 2;
            map.setPaintProperty('user-dot-halo', 'circle-radius', 11 + wave * 9);
            map.setPaintProperty('user-dot-halo', 'circle-opacity', 0.28 - wave * 0.16);
          }, 80);
        }
      }

      function applyUserLocation(lng, lat, accuracyMeters, recenter) {
        ensureUserLocationLayers();
        var source = map.getSource('user-location');
        if (source) source.setData(userLocationData(lng, lat, accuracyMeters));
        if (recenter) {
          map.easeTo({
            center: [lng, lat],
            zoom: Math.max(map.getZoom(), 16),
            duration: 650
          });
        }
      }

      function setUserLocation(lng, lat, accuracyMeters, recenter) {
        if (!isFinite(lng) || !isFinite(lat)) return;
        userLng = lng;
        userLat = lat;
        userAcc = accuracyMeters || userAcc;
        if (!userLocationReady || !map) {
          pendingUser = {
            lng: lng,
            lat: lat,
            accuracy: accuracyMeters,
            recenter: !!recenter
          };
          return;
        }
        applyUserLocation(lng, lat, accuracyMeters, recenter);
      }

      function flyToUser() {
        if (!isFinite(userLng) || !isFinite(userLat)) return;
        setUserLocation(userLng, userLat, userAcc, true);
      }

      function flushPendingUser() {
        userLocationReady = true;
        if (pendingUser) {
          var next = pendingUser;
          pendingUser = null;
          applyUserLocation(next.lng, next.lat, next.accuracy, next.recenter);
          return;
        }
        if (isFinite(userLng) && isFinite(userLat)) {
          applyUserLocation(userLng, userLat, userAcc, false);
        }
      }
  `;
}

export function userLocationUpdateScript(
  latitude: number,
  longitude: number,
  accuracy: number | null | undefined,
  recenter: boolean,
): string {
  const lat = Number(latitude);
  const lng = Number(longitude);
  const acc =
    accuracy == null || !Number.isFinite(Number(accuracy)) ? 0 : Number(accuracy);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "true;";
  return `setUserLocation(${lng}, ${lat}, ${acc}, ${recenter ? "true" : "false"}); true;`;
}

export function buildMapboxPickerHtml({
  token,
  latitude,
  longitude,
  userLatitude,
  userLongitude,
  accuracy,
}: {
  token: string;
  latitude: number;
  longitude: number;
  userLatitude?: number | null;
  userLongitude?: number | null;
  accuracy?: number | null;
}) {
  const safeToken = token.replace(/'/g, "\\'");
  const lat = Number(latitude);
  const lng = Number(longitude);
  const userLat = Number(userLatitude);
  const userLng = Number(userLongitude);
  const centerLat = Number.isFinite(userLat) ? userLat : lat;
  const centerLng = Number.isFinite(userLng) ? userLng : lng;

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
    />
    <link
      href="https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css"
      rel="stylesheet"
    />
    <script src="https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.js"></script>
    <style>
      html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; }
      .mapboxgl-ctrl-logo, .mapboxgl-ctrl-attrib { opacity: 0.65; }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script>
      ${userLocationRuntime(userLatitude, userLongitude, accuracy)}
      mapboxgl.accessToken = '${safeToken}';

      var map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [${centerLng}, ${centerLat}],
        zoom: 17
      });

      var marker = new mapboxgl.Marker({ color: '#8CC63E', draggable: true })
        .setLngLat([${lng}, ${lat}])
        .addTo(map);

      function sendPin(lngLat) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(
            JSON.stringify({
              type: 'pin',
              latitude: lngLat.lat,
              longitude: lngLat.lng
            })
          );
        }
      }

      marker.on('dragend', function () {
        sendPin(marker.getLngLat());
      });

      map.on('click', function (event) {
        marker.setLngLat(event.lngLat);
        sendPin(event.lngLat);
      });

      function movePin(lng, lat, recenter) {
        marker.setLngLat([lng, lat]);
        sendPin({ lng: lng, lat: lat });
        if (recenter) {
          map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 16), duration: 650 });
        }
      }

      map.on('load', function () {
        flushPendingUser();
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
        }
      });

      map.on('error', function (event) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(
            JSON.stringify({
              type: 'error',
              message: event.error?.message || 'Map failed to load'
            })
          );
        }
      });
    </script>
  </body>
</html>`;
}

export function buildMapboxPolygonHtml({
  token,
  latitude,
  longitude,
  points,
  userLatitude,
  userLongitude,
  accuracy,
}: {
  token: string;
  latitude: number;
  longitude: number;
  points: Array<{ latitude: number; longitude: number }>;
  userLatitude?: number | null;
  userLongitude?: number | null;
  accuracy?: number | null;
}) {
  const safeToken = token.replace(/'/g, "\\'");
  const lat = Number(latitude);
  const lng = Number(longitude);
  const userLat = Number(userLatitude);
  const userLng = Number(userLongitude);
  const hasUser = Number.isFinite(userLat) && Number.isFinite(userLng);
  const centerLat = hasUser ? userLat : lat;
  const centerLng = hasUser ? userLng : lng;
  const initial = JSON.stringify(
    (points || [])
      .filter(
        (point) =>
          Number.isFinite(point.latitude) && Number.isFinite(point.longitude),
      )
      .map((point) => [point.longitude, point.latitude]),
  );

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
    />
    <link
      href="https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css"
      rel="stylesheet"
    />
    <script src="https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.js"></script>
    <style>
      html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; }
      .mapboxgl-ctrl-logo, .mapboxgl-ctrl-attrib { opacity: 0.65; }
      #hint {
        position: absolute;
        left: 10px;
        right: 10px;
        top: 10px;
        z-index: 2;
        background: rgba(26, 26, 26, 0.72);
        color: #fff;
        font: 13px/18px sans-serif;
        padding: 8px 10px;
        border-radius: 8px;
        pointer-events: none;
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <div id="hint">Tap the map to clip each field corner. Pan and pinch to move.</div>
    <script>
      ${userLocationRuntime(userLatitude, userLongitude, accuracy)}
      mapboxgl.accessToken = '${safeToken}';
      var points = ${initial};
      var dragging = false;

      var map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        center: [${centerLng}, ${centerLat}],
        zoom: 17,
        doubleClickZoom: false
      });

      function send(payload) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        }
      }

      function closedRing() {
        if (points.length < 3) return points.slice();
        return points.concat([points[0]]);
      }

      function toGeojson() {
        var features = points.map(function (pair, index) {
          return {
            type: 'Feature',
            properties: { kind: 'vertex', index: index },
            geometry: { type: 'Point', coordinates: pair }
          };
        });
        if (points.length >= 2) {
          features.push({
            type: 'Feature',
            properties: { kind: 'outline' },
            geometry: { type: 'LineString', coordinates: closedRing() }
          });
        }
        if (points.length >= 3) {
          features.push({
            type: 'Feature',
            properties: { kind: 'fill' },
            geometry: { type: 'Polygon', coordinates: [closedRing()] }
          });
        }
        return { type: 'FeatureCollection', features: features };
      }

      function nativePoints() {
        return points.map(function (pair) {
          return { longitude: pair[0], latitude: pair[1] };
        });
      }

      function render() {
        var source = map.getSource('boundary');
        if (source) source.setData(toGeojson());
        send({ type: 'polygon', points: nativePoints() });
      }

      function undoLast() {
        if (points.length) points.pop();
        render();
      }

      function clearAll() {
        points = [];
        render();
      }

      map.on('dragstart', function () { dragging = true; });
      map.on('zoomstart', function () { dragging = true; });
      map.on('dragend', function () {
        setTimeout(function () { dragging = false; }, 80);
      });
      map.on('zoomend', function () {
        setTimeout(function () { dragging = false; }, 80);
      });

      map.on('click', function (event) {
        if (dragging) return;
        points.push([event.lngLat.lng, event.lngLat.lat]);
        render();
      });

      map.on('load', function () {
        map.addSource('boundary', {
          type: 'geojson',
          data: toGeojson()
        });
        map.addLayer({
          id: 'boundary-fill',
          type: 'fill',
          source: 'boundary',
          filter: ['==', ['get', 'kind'], 'fill'],
          paint: {
            'fill-color': '#8CC63E',
            'fill-opacity': 0.35
          }
        });
        map.addLayer({
          id: 'boundary-line',
          type: 'line',
          source: 'boundary',
          filter: ['==', ['get', 'kind'], 'outline'],
          paint: {
            'line-color': '#8CC63E',
            'line-width': 3
          }
        });
        map.addLayer({
          id: 'boundary-points',
          type: 'circle',
          source: 'boundary',
          filter: ['==', ['get', 'kind'], 'vertex'],
          paint: {
            'circle-radius': 6,
            'circle-color': '#244D38',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff'
          }
        });

        if (!(isFinite(userLat) && isFinite(userLng)) && points.length >= 2) {
          var bounds = new mapboxgl.LngLatBounds(points[0], points[0]);
          points.forEach(function (pair) { bounds.extend(pair); });
          map.fitBounds(bounds, { padding: 48, maxZoom: 18 });
        }

        flushPendingUser();
        render();
        send({ type: 'ready' });
      });

      map.on('error', function (event) {
        send({
          type: 'error',
          message: event.error && event.error.message
            ? event.error.message
            : 'Map failed to load'
        });
      });
    </script>
  </body>
</html>`;
}
