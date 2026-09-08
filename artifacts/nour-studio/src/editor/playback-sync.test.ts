import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldCommitRangeSeek, shouldSeekMedia } from './playback-sync.ts';

const decision = (overrides: Partial<Parameters<typeof shouldSeekMedia>[0]> = {}) => shouldSeekMedia({
  currentTime: 1,
  targetTime: 1.3,
  active: true,
  playing: true,
  master: true,
  forced: false,
  ...overrides,
});

test('a naturally playing master is never chased by the React timeline clock', () => {
  assert.equal(decision({ targetTime: 4 }), false);
});

test('external seeks and clip activation seek the active master', () => {
  assert.equal(decision({ targetTime: 4, forced: true }), true);
});

test('paused preview-time updates wait for an explicit seek commit', () => {
  assert.equal(decision({ playing: false, targetTime: 4 }), false);
  assert.equal(decision({ playing: false, targetTime: 4, forced: true }), true);
});

test('audio slaves only correct material drift while playing', () => {
  assert.equal(decision({ master: false }), false);
  assert.equal(decision({ master: false, targetTime: 2 }), true);
});

test('inactive preloaded media is not sought', () => {
  assert.equal(decision({ active: false, forced: true, targetTime: 4 }), false);
});

test('range drag previews are coalesced until pointer release', () => {
  assert.equal(shouldCommitRangeSeek('change', true), false);
  assert.equal(shouldCommitRangeSeek('change', true), false);
  assert.equal(shouldCommitRangeSeek('pointerup', true), true);
});

test('keyboard range changes commit immediately', () => {
  assert.equal(shouldCommitRangeSeek('change', false), true);
});