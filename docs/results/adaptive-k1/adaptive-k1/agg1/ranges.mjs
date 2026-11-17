export function mergeRanges(ranges, {joinAdjacent=false}={}) {
  if (!Array.isArray(ranges)) throw new TypeError('ranges');
  const ordered = ranges.map(pair => {
    if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(Number.isSafeInteger) || pair[0] >= pair[1]) throw new TypeError('range');
    return [...pair];
  }).sort((a,b)=>a[0]-b[0]);
  const out=[];
  for (const pair of ordered) {
    const last=out.at(-1);
    if (last && (pair[0] < last[1] || (joinAdjacent && pair[0] === last[1]))) last[1]=Math.max(last[1],pair[1]);
    else out.push(pair);
  }
  return out;
}
