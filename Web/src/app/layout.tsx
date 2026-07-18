import type { ReactNode } from "react";
import localFont from "next/font/local";

import "./globals.css";

const satoshi = localFont({
  src: [
    {
      path: "./Fonts/Satoshi_Complete/Fonts/WEB/fonts/Satoshi-Variable.woff2",
      weight: "100 900",
      style: "normal",
    },
    {
      path: "./Fonts/Satoshi_Complete/Fonts/WEB/fonts/Satoshi-VariableItalic.woff2",
      weight: "100 900",
      style: "italic",
    },
  ],
  variable: "--font-satoshi",
  display: "swap",
});

const satoshiRegular = localFont({
  src: "./Fonts/Satoshi_Complete/Fonts/WEB/fonts/Satoshi-Regular.woff2",
  weight: "400",
  style: "normal",
  variable: "--font-satoshi-regular",
  display: "swap",
});

const satoshiMedium = localFont({
  src: "./Fonts/Satoshi_Complete/Fonts/WEB/fonts/Satoshi-Medium.woff2",
  weight: "500",
  style: "normal",
  variable: "--font-satoshi-medium",
  display: "swap",
});

const satoshiBold = localFont({
  src: "./Fonts/Satoshi_Complete/Fonts/WEB/fonts/Satoshi-Bold.woff2",
  weight: "700",
  style: "normal",
  variable: "--font-satoshi-bold",
  display: "swap",
});

const satoshiItalic = localFont({
  src: "./Fonts/Satoshi_Complete/Fonts/WEB/fonts/Satoshi-Italic.woff2",
  weight: "400",
  style: "italic",
  variable: "--font-satoshi-italic",
  display: "swap",
});

export const metadata = {
  title: "KriSHE Carbon Dashboard",
  description: "KriSHE Carbon dMRV operations portal",
  icons: {
    icon: "/icons/logo-symbol-green.png",
    apple: "/icons/logo-symbol-green.png",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${satoshi.variable} ${satoshiRegular.variable} ${satoshiMedium.variable} ${satoshiBold.variable} ${satoshiItalic.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
