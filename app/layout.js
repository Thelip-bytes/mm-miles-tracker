import "./globals.css";

export const metadata = {
  title: "MM Miles — Booking Ledger",
  description: "Self-drive rental booking, payout, and cash flow ledger for MM Miles.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1C2541",
};

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/*
          These used to be pulled in by an `@import url(...)` on the first line
          of globals.css. A CSS @import is the slowest way to load a font:
          the browser cannot see it until the stylesheet has downloaded AND
          parsed, so it adds a full serial round trip before any text can paint,
          and nothing can be preconnected. Declaring the links in the document
          head lets the preload scanner find them immediately and start the TLS
          handshakes in parallel with the HTML.

          Better still, replace all three tags with next/font/google and
          self-host the files — zero third-party requests, no layout shift:

            import { Inter, Fraunces, IBM_Plex_Mono } from "next/font/google";
            const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
            ...
            <body className={`${inter.variable} ${fraunces.variable} ${plex.variable}`}>

          and drop the hard-coded family names from globals.css.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONT_HREF} />
      </head>
      <body>{children}</body>
    </html>
  );
}
