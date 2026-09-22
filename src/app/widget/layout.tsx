import { Metadata } from "next";

export const metadata: Metadata = {
  title: "VoiceFlow Widget",
  description: "Quick record widget",
};

export default function WidgetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="bg-transparent" style={{ backgroundColor: "transparent" }}>
      <body className="bg-transparent m-0 p-0 overflow-hidden" style={{ backgroundColor: "transparent" }}>
        {children}
      </body>
    </html>
  );
}
