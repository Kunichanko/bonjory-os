import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "bonjory-os",
  description: "ゲーム",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Mantou+Sans&display=swap" />
        <meta name="theme-color" content="#6aac14" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#6aac14" media="(prefers-color-scheme: dark)" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body>
        {children}
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js')
                .catch(function(err) { console.error('SW registration failed:', err); });
            });
          }
        `}} />
      </body>
    </html>
  );
}
