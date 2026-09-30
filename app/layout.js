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

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
