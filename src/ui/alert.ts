import { Alert, Platform } from 'react-native';

export interface AlertButton {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

export interface AlertOptions {
  cancelable?: boolean;
  onDismiss?: () => void;
}

/**
 * Cross-platform alert/confirmation dialog.
 *
 * React Native Web provides an empty stub (`alert() {}`) for `Alert.alert`.
 * This helper bridges the gap by delegating to `window.confirm` / `window.alert`
 * on web while preserving full native `Alert.alert` fidelity on iOS and Android.
 */
export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: AlertOptions,
): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      const text = message ? `${title}\n\n${message}` : title;

      if (buttons && buttons.length > 1) {
        // Multi-button prompt (e.g. Cancel + Delete / Move)
        const cancelBtn = buttons.find((b) => b.style === 'cancel');
        const confirmBtn = buttons.find((b) => b.style !== 'cancel') ?? buttons[1];
        const result = window.confirm(text);
        if (result) {
          confirmBtn?.onPress?.();
        } else {
          if (cancelBtn?.onPress) {
            cancelBtn.onPress();
          } else {
            options?.onDismiss?.();
          }
        }
      } else if (buttons && buttons.length === 1) {
        window.alert(text);
        buttons[0]?.onPress?.();
      } else {
        window.alert(text);
        options?.onDismiss?.();
      }
    }
  } else {
    Alert.alert(title, message, buttons, options);
  }
}
