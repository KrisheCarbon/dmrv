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

export function buildMapboxPickerHtml({
  token,
  latitude,
  longitude,
}: {
  token: string;
  latitude: number;
  longitude: number;
}) {
  const safeToken = token.replace(/'/g, "\\'");
  const lat = Number(latitude);
  const lng = Number(longitude);

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
      mapboxgl.accessToken = '${safeToken}';

      var map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [${lng}, ${lat}],
        zoom: 14
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

      map.on('load', function () {
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
}: {
  token: string;
  latitude: number;
  longitude: number;
  points: Array<{ latitude: number; longitude: number }>;
}) {
  const safeToken = token.replace(/'/g, "\\'");
  const lat = Number(latitude);
  const lng = Number(longitude);
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
      mapboxgl.accessToken = '${safeToken}';
      var points = ${initial};
      var dragging = false;

      var map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        center: [${lng}, ${lat}],
        zoom: 16,
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

        if (points.length >= 2) {
          var bounds = new mapboxgl.LngLatBounds(points[0], points[0]);
          points.forEach(function (pair) { bounds.extend(pair); });
          map.fitBounds(bounds, { padding: 48, maxZoom: 18 });
        }

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
