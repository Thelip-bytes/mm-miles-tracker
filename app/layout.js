import "./globals.css";

export const metadata = {
  title: "MM Miles — Booking Ledger",
  description: "Self-drive rental booking, payout, and cash flow ledger for MM Miles.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
