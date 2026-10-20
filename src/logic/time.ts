const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86400],
  ["month", 30 * 86400],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

/** "hace 2 horas" / "2 hours ago" / "2小时前" for an RFC 3339 date. */
export function relativeTime(iso: string, lang: string, now = Date.now()): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const secs = Math.round((ms - now) / 1000);
  const fmt = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(secs) >= size) return fmt.format(Math.trunc(secs / size), unit);
  }
  return fmt.format(0, "second");
}
