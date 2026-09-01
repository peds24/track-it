import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { IosInstallPrompt } from '../IosInstallPrompt';
import { Platform } from 'react-native';

describe('IosInstallPrompt', () => {
  const originalPlatform = Platform.OS;
  const originalWindow = global.window;

  beforeEach(() => {
    const mockStorage: Record<string, string> = {};
    (global as any).window = {
      navigator: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
        standalone: false,
      },
      matchMedia: () => ({ matches: false }),
      localStorage: {
        getItem: (k: string) => mockStorage[k] ?? null,
        setItem: (k: string, v: string) => {
          mockStorage[k] = v;
        },
      },
    };
  });

  afterEach(() => {
    Platform.OS = originalPlatform;
    (global as any).window = originalWindow;
    jest.restoreAllMocks();
  });

  it('renders nothing on non-web platforms', async () => {
    Platform.OS = 'ios';
    await render(<IosInstallPrompt />);
    expect(screen.queryByText(/Install Track It on iOS/i)).toBeNull();
  });

  it('renders instructions on web when on iOS and not standalone', async () => {
    Platform.OS = 'web';
    await render(<IosInstallPrompt />);
    expect(screen.getByText('Install Track It on iOS')).toBeTruthy();
    expect(screen.getByText(/Add to Home Screen/i)).toBeTruthy();
  });

  it('hides and stores dismissal when dismiss is tapped', async () => {
    Platform.OS = 'web';
    await render(<IosInstallPrompt />);

    const dismissBtn = screen.getByText('Dismiss');
    await fireEvent.press(dismissBtn);

    expect(window.localStorage.getItem('trackit_ios_prompt_dismissed')).toBe('true');
    expect(screen.queryByText('Install Track It on iOS')).toBeNull();
  });
});
