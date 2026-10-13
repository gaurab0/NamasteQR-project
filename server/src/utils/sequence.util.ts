export function incrementSequence(current: string): string {
  const match = current.match(/^(.*?)(\d+)(\D*)$/);
  if (!match) {
    return current + '1';
  }
  const [, prefix, numStr, suffix] = match;
  const numLength = numStr.length;
  const nextNum = (parseInt(numStr, 10) + 1).toString();
  const paddedNextNum = nextNum.padStart(numLength, '0');
  return prefix + paddedNextNum + suffix;
}
