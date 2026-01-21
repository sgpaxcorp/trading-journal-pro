// app/components/ThemeInitScript.tsx
import Script from "next/script";

/**
 * Prevents a flash of wrong theme/lang on first load.
 * Reads localStorage BEFORE React hydration.
 *
 * Keys:
 * - nt_theme: "neuro" | "light"
 * - nt_locale: "en" | "es" | ...
 */
export default function ThemeInitScript() {
  const js = `
(function () {
  try {
    var theme = localStorage.getItem("nt_theme") || "neuro";
    var locale = localStorage.getItem("nt_locale") || "en";

    var root = document.documentElement;
    root.classList.remove("theme-neuro", "theme-light");
    root.classList.add(theme === "light" ? "theme-light" : "theme-neuro");

    root.lang = locale || "en";

    // color-scheme helps inputs, scrollbars, etc.
    root.style.colorScheme = (theme === "light" ? "light" : "dark");
  } catch (e) {
    // ignore
  }
})();`;

  return (
    <Script
      id="nt-theme-locale-init"
      strategy="beforeInteractive"
      dangerouslySetInnerHTML={{ __html: js }}
    />
  );
}
