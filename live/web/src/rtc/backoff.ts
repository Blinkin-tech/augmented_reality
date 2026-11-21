export function nextDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 10000);
}

export function giveUp(elapsedMs: number): boolean {
  return elapsedMs >= 60000;
}
