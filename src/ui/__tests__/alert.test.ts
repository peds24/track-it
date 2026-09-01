import { Alert, Platform } from 'react-native';
import { showAlert } from '@/ui/alert';

describe('showAlert', () => {
  const originalPlatform = Platform.OS;

  afterEach(() => {
    Platform.OS = originalPlatform;
    jest.restoreAllMocks();
  });

  describe('on native platforms', () => {
    beforeEach(() => {
      Platform.OS = 'ios';
    });

    test('forwards title, message, buttons and options to Alert.alert', () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      const onConfirm = jest.fn();
      const onCancel = jest.fn();

      showAlert(
        'Delete item?',
        'This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel', onPress: onCancel },
          { text: 'Delete', style: 'destructive', onPress: onConfirm },
        ],
        { onDismiss: onCancel },
      );

      expect(alertSpy).toHaveBeenCalledWith(
        'Delete item?',
        'This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel', onPress: onCancel },
          { text: 'Delete', style: 'destructive', onPress: onConfirm },
        ],
        { onDismiss: onCancel },
      );
    });
  });

  describe('on web platform', () => {
    let confirmMock: jest.Mock;
    let alertMock: jest.Mock;

    beforeEach(() => {
      Platform.OS = 'web';
      if (typeof window === 'undefined') {
        (global as any).window = {};
      }
      confirmMock = jest.fn();
      alertMock = jest.fn();
      (window as any).confirm = confirmMock;
      (window as any).alert = alertMock;
    });

    test('calls window.confirm and executes confirm button on true', () => {
      confirmMock.mockReturnValue(true);
      const onConfirm = jest.fn();
      const onCancel = jest.fn();

      showAlert('Delete item?', 'This cannot be undone.', [
        { text: 'Cancel', style: 'cancel', onPress: onCancel },
        { text: 'Delete', style: 'destructive', onPress: onConfirm },
      ]);

      expect(confirmMock).toHaveBeenCalledWith('Delete item?\n\nThis cannot be undone.');
      expect(onConfirm).toHaveBeenCalled();
      expect(onCancel).not.toHaveBeenCalled();
    });

    test('calls window.confirm and executes cancel button on false', () => {
      confirmMock.mockReturnValue(false);
      const onConfirm = jest.fn();
      const onCancel = jest.fn();

      showAlert('Delete item?', 'This cannot be undone.', [
        { text: 'Cancel', style: 'cancel', onPress: onCancel },
        { text: 'Delete', style: 'destructive', onPress: onConfirm },
      ]);

      expect(confirmMock).toHaveBeenCalledWith('Delete item?\n\nThis cannot be undone.');
      expect(onConfirm).not.toHaveBeenCalled();
      expect(onCancel).toHaveBeenCalled();
    });

    test('calls onDismiss when cancel button has no onPress', () => {
      confirmMock.mockReturnValue(false);
      const onDismiss = jest.fn();
      const onConfirm = jest.fn();

      showAlert(
        'Delete item?',
        'This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: onConfirm },
        ],
        { onDismiss },
      );

      expect(onDismiss).toHaveBeenCalled();
      expect(onConfirm).not.toHaveBeenCalled();
    });

    test('calls window.alert for informational alerts without buttons', () => {
      showAlert('Error', 'Something went wrong');

      expect(alertMock).toHaveBeenCalledWith('Error\n\nSomething went wrong');
    });

    test('calls single button onPress after window.alert', () => {
      const onOk = jest.fn();

      showAlert('Info', 'Operation succeeded', [{ text: 'OK', onPress: onOk }]);

      expect(alertMock).toHaveBeenCalledWith('Info\n\nOperation succeeded');
      expect(onOk).toHaveBeenCalled();
    });
  });
});
