import type React from "react";
import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import { Suspense } from 'react';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Administration des Redirections Email",
  description: "Gérer les règles de redirection email par domaine",
  generator: "v0.dev",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <body className={inter.className}>
        <Suspense>
          {children}
        </Suspense>
        <Toaster
          position="top-right"
          richColors
          closeButton
          toastOptions={{
            style: {
              background: "white",
              color: "black",
              border: "1px solid #e5e7eb",
            },
          }}
        />
      </body>
    </html>
  );
}
