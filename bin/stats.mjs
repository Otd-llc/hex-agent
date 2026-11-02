// Shared interval rules for the presentation generators (otd-scientific-writing statistics):
// below 30 items the t critical value with items-1 df replaces 1.96; below 10 items no
// interval is reported at all, per-item scores only. Lives in bin/ because only reporting
// scripts read it (src/ is the agent; the demo pre-flight keeps src/ identical to eval-final).

// Two-sided 95% t critical values, df 1 to 29.
const T95 = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131,
  2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045];
export const MIN_ITEMS_FOR_INTERVAL = 10;
export function crit(items) {
  if (items >= 30) return { value: 1.96, name: 'z' };
  return { value: T95[items - 2], name: `t${items - 1}` };
}
// The critical value for n items, or null when n is too small to report an interval.
export const critOrNull = (items) => (items < MIN_ITEMS_FOR_INTERVAL ? null : crit(items));
