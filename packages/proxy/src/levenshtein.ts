export const levenshteinDistance = (left: string, right: string): number => {
  if (left === right) {
    return 0;
  }
  if (left.length === 0) {
    return right.length;
  }
  if (right.length === 0) {
    return left.length;
  }

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost =
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      const insertion = (current[rightIndex - 1] ?? 0) + 1;
      const deletion = (previous[rightIndex] ?? 0) + 1;
      const substitution = (previous[rightIndex - 1] ?? 0) + substitutionCost;
      current[rightIndex] = Math.min(insertion, deletion, substitution);
    }
    previous = current;
  }
  return previous[right.length] ?? 0;
};
