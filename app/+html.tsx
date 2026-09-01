import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Custom root HTML template for Expo Router Web export.
 * Configured specifically for iOS Safari PWA / "Add to Home Screen" standalone experience.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />

        {/* PWA & iOS Safari Standalone Meta Tags */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Track It" />
        <meta name="application-name" content="Track It" />
        <meta name="theme-color" content="#386A20" />
        <meta name="mobile-web-app-capable" content="yes" />

        {/* Apple Touch Icon & Manifest */}
        <link rel="apple-touch-icon" href="/track-it-private/apple-touch-icon.png" />
        <link rel="icon" type="image/png" href="/track-it-private/favicon.png" />
        <link rel="manifest" href="/track-it-private/manifest.json" />

        {/* Expo Router style reset */}
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: responsiveBackgroundStyles }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const responsiveBackgroundStyles = `
body {
  background-color: #FBFDF8;
  margin: 0;
  padding: 0;
  overscroll-behavior-y: none;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  -webkit-user-select: none;
}
@media (prefers-color-scheme: dark) {
  body {
    background-color: #191C1A;
  }
}
`;
