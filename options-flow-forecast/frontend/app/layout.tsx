export const metadata = {
  title: "Options Flow Forecast",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui", margin: 0, background: "#0b1220", color: "#e2e8f0" }}>
        {children}
      </body>
    </html>
  );
}
