
/**
 * Root <head> for App Router.
 * Ensures the favicon appears next to the web address / browser tab.
 *
 * Place your favicon at:
 *   /public/favicon.ico
 *
 * (You already did.)
 */
export default function Head() {
  return (
    <>
      <link rel="icon" href="/favicon.ico" sizes="any" />
      <link rel="shortcut icon" href="/favicon.ico" />
      <link rel="apple-touch-icon" href="/favicon.ico" />
      <meta name="theme-color" content="#020617" />
    </>
  );
}
