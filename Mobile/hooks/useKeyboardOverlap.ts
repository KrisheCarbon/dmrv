import { useEffect, useState } from "react";
import { Dimensions, Keyboard, Platform, type KeyboardEvent } from "react-native";

/**
 * How many pixels of this window the keyboard is covering.
 * Returns 0 when the window already resized above the keyboard, so callers
 * can pad once without leaving a double gap.
 */
export function useKeyboardOverlap() {
  const [overlap, setOverlap] = useState(0);

  useEffect(() => {
    function onShow(event: KeyboardEvent) {
      const windowHeight = Dimensions.get("window").height;
      const screenY = event.endCoordinates.screenY;
      const covered =
        screenY > 0 ? windowHeight - screenY : event.endCoordinates.height;
      setOverlap(Math.max(0, Math.round(covered)));
    }

    function onHide() {
      setOverlap(0);
    }

    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return overlap;
}

/** Max height for a scrolling list inside a bottom sheet that sits above the keyboard. */
export function sheetListMaxHeight(keyboardOverlap: number, reserved: number) {
  const windowHeight = Dimensions.get("window").height;
  const available = windowHeight - keyboardOverlap - 36;
  return Math.max(120, available - reserved);
}
