import assert from 'node:assert/strict';
import test from 'node:test';
import { hasTrackOverlap, splitTimelineClip, isTextOverlayActive } from './use-editor-engine';
import type { TimelineClip, TextOverlay } from './types';

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

test('splitting preserves source range and timeline duration', () => {
  const original = { ...clip('original', 'video', 3, 8), trimStart: 2 };
  const result = splitTimelineClip(original, 6, 'right');
  assert.ok(result);
  const [left, right] = result;
  assert.equal(left.duration, 3);
  assert.equal(right.start, 6);
  assert.equal(right.trimStart, 5);
  assert.equal(right.duration, 5);
  assert.equal(left.duration + right.duration, original.duration);
});

test('splitting rejects clip edges', () => {
  const original = clip('original', 'video', 3, 8);
  assert.equal(splitTimelineClip(original, 3, 'right'), null);
  assert.equal(splitTimelineClip(original, 11, 'right'), null);
});

test('text overlays are active only within their half-open time range', () => {
  const overlay: TextOverlay = { id: 'o', kind: 'caption', text: 'hello', start: 2, duration: 3, position: 'bottom' };
  assert.equal(isTextOverlayActive(overlay, 1.99), false);
  assert.equal(isTextOverlayActive(overlay, 2), true);
  assert.equal(isTextOverlayActive(overlay, 4.99), true);
  assert.equal(isTextOverlayActive(overlay, 5), false);
});