/** Include both partial edge buckets in a rolling activity window. */
export function activityBuckets(points: { t: string; txs: number }[], bucketSeconds: number, at: number, hours = 24) {
  const bucket = bucketSeconds * 1000;
  const first = Math.floor((at - hours * 3_600_000) / bucket) * bucket;
  const last = Math.floor(at / bucket) * bucket;
  const counts = new Map(points.map(p => [Date.parse(p.t), p.txs]));
  return Array.from({ length: Math.round((last - first) / bucket) + 1 }, (_, i) => {
    const time = first + i * bucket;
    return { time, txs: counts.get(time) ?? 0 };
  });
}

/** A zero baseline has no finite percentage change. */
export function activityChange(current: number, previous: number | undefined) {
  if (previous == null) return { label: "—", direction: "unknown" };
  if (previous === 0) return current === 0 ? { label: "0%", direction: "flat" } : { label: "New", direction: "up" };
  const value = (current - previous) / previous * 100;
  return { label: `${value > 0 ? "+" : ""}${Number(value.toFixed(1))}%`, direction: value > 0 ? "up" : value < 0 ? "down" : "flat" };
}
