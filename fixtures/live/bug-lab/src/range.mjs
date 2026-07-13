export function clamp(value, minimum, maximum) {
  if (value < minimum) return minimum;
  if (value > maximum) return value;
  return value;
}
