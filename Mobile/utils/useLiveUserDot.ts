import { useEffect } from "react";
import { watchDeviceCoordinate } from "./location";
import { userLocationUpdateScript } from "./mapbox";

type MapWebViewRef = {
  readonly current: { injectJavaScript: (script: string) => void } | null;
};

/** Moves the on-map blue dot as the phone's GPS fix updates. */
export function useLiveUserDot(active: boolean, webViewRef: MapWebViewRef) {
  useEffect(() => {
    if (!active) return;

    let removed = false;
    let subscription: { remove: () => void } | null = null;

    watchDeviceCoordinate((coord) => {
      webViewRef.current?.injectJavaScript(
        userLocationUpdateScript(
          coord.latitude,
          coord.longitude,
          coord.accuracy,
          false,
        ),
      );
    }).then((next) => {
      if (removed) {
        next?.remove();
        return;
      }
      subscription = next;
    });

    return () => {
      removed = true;
      subscription?.remove();
    };
  }, [active, webViewRef]);
}
