import assert from 'node:assert/strict';
import test from 'node:test';
import { hasTrackOverlap } from './use-editor-engine';
import type { TimelineClip } from './types';

const clip = (id: string, track: TimelineClip['track'], start: number, duration: number): TimelineClip => ({
  id, track, start, duration, assetId: id, trimStart: 0, volume: 1, muted: false,
});

test('adjacent clips do not overlap', () => {
  assert.equal(hasTrackOverlap([clip('a', 'video', 0, 5)], clip('b', 'video', 5, 2)), false);
});

test('same-track intersections overlap but cross-track clips do not', () => {
  const existing = [clip('a', 'video', 2, 5)];
  assert.equal(hasTrackOverlap(existing, clip('b', 'video', 3, 1)), true);
  assert.equal(hasTrackOverlap(existing, clip('b', 'audio', 3, 1)), false);
});

test('a clip does not overlap itself during edits', () => {
  const existing = [clip('a', 'video', 2, 5)];
  assert.equal(hasTrackOverlap(existing, clip('a', 'video', 3, 1)), false);
});