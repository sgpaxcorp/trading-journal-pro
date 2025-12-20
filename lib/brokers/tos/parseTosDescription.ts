function tosYYMMDDCompact(expiryISO: string) {
  const yy = expiryISO.slice(2, 4);
  const mm = expiryISO.slice(5, 7);
  const dd = expiryISO.slice(8, 10);
  return `${yy}${mm}${dd}`;
}

function formatContractCodeSimple(opts: {
  root: string;        // SPX o SPXW
  expiryISO: string;   // YYYY-MM-DD
  right: "C" | "P";
  strike: number;      // 6985
}) {
  const datePart = tosYYMMDDCompact(opts.expiryISO);

  // strike sin padding, como tu ejemplo
  const strikePart = Number.isInteger(opts.strike)
    ? String(opts.strike)
    : String(opts.strike).replace(/\.0+$/, "");

  return `${opts.root}${datePart}${opts.right}${strikePart}`;
}
