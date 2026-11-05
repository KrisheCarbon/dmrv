import type { LocationObject } from "expo-location";

export const MOCK_LOCATION_MESSAGE =
  "This phone is using a fake GPS location. Turn off the mock-location app, then try again.";

export class LocationUnavailableError extends Error {
  constructor(
    message = "Could not get your location. Make sure GPS/location is turned on, then try again.",
  ) {
    super(message);
    this.name = "LocationUnavailableError";
  }
}

/** Android mock-location apps (Flying GPS and similar) set this on the fix. */
export class MockLocationError extends LocationUnavailableError {
  constructor() {
    super(MOCK_LOCATION_MESSAGE);
    this.name = "MockLocationError";
  }
}

let mockLocationActive = false;

export function isUsingMockLocation(): boolean {
  return mockLocationActive;
}

/** True when this fix was injected by a mock-location app. Android only. */
export function isMockedFix(position: LocationObject | null | undefined): boolean {
  return position?.mocked === true;
}

/**
 * Remember whether the latest fix was mocked.
 * A later real fix clears it, so turning the fake-GPS app off recovers.
 * Returns true when the fix must be rejected.
 */
export function noteLocationFix(position: LocationObject | null | undefined): boolean {
  if (!position) return mockLocationActive;
  mockLocationActive = isMockedFix(position);
  return mockLocationActive;
}

export function assertRealLocationFix(position: LocationObject | null | undefined): void {
  if (noteLocationFix(position)) {
    throw new MockLocationError();
  }
}
