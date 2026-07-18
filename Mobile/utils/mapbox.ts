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
