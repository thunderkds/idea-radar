import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./tokens.css";
import "./components.css";
import "./globals.css";
import type { ReactNode } from "react";
import { Shell } from "./_components/shell";

export const metadata = {
  title: "Idea Radar",
  description: "Trending, medium and lowkey GitHub repos",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="gm-page">
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
