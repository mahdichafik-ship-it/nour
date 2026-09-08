export const PAUSED_SEEK_THRESHOLD = 0.08;
export const PLAYING_SLAVE_DRIFT_THRESHOLD = 0.75;

export function shouldCommitRangeSeek(event: 'change' | 'pointerup', pointerScrubbing: boolean): boolean {
  return event === 'pointerup' || !pointerScrubbing;
}

export function shouldSeekMedia({
  currentTime,
  targetTime,
  active,
  playing,
  master,
  forced,
}: {
  currentTime: number;
  targetTime: number;
  active: boolean;
  playing: boolean;
  master: boolean;
  forced: boolean;
}): boolean {
  if (!active || !Number.isFinite(targetTime)) return false;
  const drift = Math.abs(currentTime - targetTime);
  if (forced) return drift > PAUSED_SEEK_THRESHOLD;
  if (!playing) return false;
  return !master && drift > PLAYING_SLAVE_DRIFT_THRESHOLD;
}