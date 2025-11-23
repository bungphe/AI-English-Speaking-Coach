import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI English Speaking Coach',
  description: 'An interactive web application where an AI coach helps users improve their English speaking skills.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" crossOrigin="anonymous" referrerPolicy="no-referrer" />
      </head>
      <body className="bg-gray-900 text-white antialiased">
        {children}
      </body>
    </html>
  );
}