import "./globals.css";

export const metadata = {
  title: "MM Miles — Booking Ledger",
  description: "Self-drive rental booking, payout, and cash flow ledger for MM Miles.",
};

<<<<<<< HEAD
=======
export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1C2541",
};

>>>>>>> 07f5e40 (mobile)
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
