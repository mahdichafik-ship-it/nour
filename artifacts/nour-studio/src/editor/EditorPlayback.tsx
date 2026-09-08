import { useEffect, useMemo, useRef, type RefObject } from 'react';
import type { EditorController, MediaAsset, TimelineClip } from './types';

function sync(el: HTMLMediaElement | null, time: number, shouldPlay: boolean, volume: number, muted: boolean, report: (s: string) => void, failed?: () => void) {
  if (!el || el.readyState < HTMLMediaElement.HAVE_METADATA) return; el.volume = Math.max(0, Math.min(1, volume)); el.muted = muted;
  if (Math.abs(el.currentTime - time) > .18) el.currentTime = Math.max(0, time);
  if (shouldPlay && el.paused) void el.play().catch(() => { failed?.(); report('Playback was blocked or this media format is unsupported.'); });
  if (!shouldPlay && !el.paused) el.pause();
}
function Media({ asset, clip, editor, visual = false, master = false }: { asset: MediaAsset; clip?: TimelineClip; editor: EditorController; visual?: boolean; master?: boolean }) {
  const ref = useRef<HTMLMediaElement>(null);
  const rejected = useRef(false);
  const local = clip ? editor.currentTime - clip.start + clip.trimStart : editor.currentTime;
  const active = !clip || (editor.currentTime >= clip.start && editor.currentTime < clip.start + clip.duration);
  const effectiveVolume = (clip?.volume ?? 1) * editor.volume;
  const effectiveMuted = editor.muted || !!clip?.muted || (!!clip && editor.trackMuted[clip.track]);
  const attempt = editor.playing && active && !rejected.current;
  useEffect(() => { sync(ref.current, local, attempt, effectiveVolume, effectiveMuted, editor.reportError, () => { rejected.current = true; }); }, [local, attempt, effectiveVolume, effectiveMuted, editor.reportError]);
  useEffect(() => { if (master) editor.setPlaybackReady((ref.current?.readyState ?? 0) >= HTMLMediaElement.HAVE_FUTURE_DATA); }, [master, editor.setPlaybackReady]);
  useEffect(() => { if (!editor.playing) rejected.current = false; }, [editor.playing]);
  const onMetadata = () => sync(ref.current, local, attempt, effectiveVolume, effectiveMuted, editor.reportError, () => { rejected.current = true; });
  const onError = () => { rejected.current = true; editor.reportError(`${asset.name} could not be played because its format is unsupported or corrupt.`); };
  if (asset.kind === 'image') return visual && active ? <img src={asset.src} alt={asset.name} /> : null;
  const readiness = () => { onMetadata(); if (master) editor.setPlaybackReady(true); };
  const waiting = () => { if (master) editor.setPlaybackReady(false); };
  const timeUpdate = () => { if (master && editor.playing && ref.current) editor.syncPlaybackTime(clip ? clip.start + ref.current.currentTime - clip.trimStart : ref.current.currentTime); };
  const common = { src: asset.src, onLoadedMetadata: readiness, onCanPlay: readiness, onWaiting: waiting, onStalled: waiting, onSeeking: waiting, onSeeked: readiness, onTimeUpdate: timeUpdate, onError, onPlay: () => { rejected.current = false; } };
  return asset.kind === 'video' && visual ? <video ref={ref as RefObject<HTMLVideoElement>} {...common} playsInline preload="auto" style={{ display: active ? 'block' : 'none' }} /> : <audio ref={ref as RefObject<HTMLAudioElement>} {...common} preload="auto" />;
}
export function EditorPlayback({ editor }: { editor: EditorController }) {
  const selected = editor.assets.find(a => a.id === editor.selectedAssetId);
  const timeline = useMemo(() => editor.clips.map(c => ({ c, a: editor.assets.find(a => a.id === c.assetId) })).filter((x): x is { c: TimelineClip; a: MediaAsset } => !!x.a && !x.a.error), [editor.clips, editor.assets]);
  const activeVisual = editor.mode === 'timeline' ? timeline.find(({ c, a }) => a.kind !== 'audio' && editor.currentTime >= c.start && editor.currentTime < c.start + c.duration) : undefined;
  const activeVideoId = activeVisual?.a.kind === 'video' ? activeVisual.c.id : null;
  useEffect(() => {
    const sourceNeedsMedia = editor.mode === 'source' && (selected?.kind === 'video' || selected?.kind === 'audio');
    if (!sourceNeedsMedia && !activeVideoId) editor.setPlaybackReady(true);
  }, [editor.mode, selected?.id, selected?.kind, activeVideoId, editor.setPlaybackReady]);
  return <div className="editor-playback">
    <div className="editor-playback-visual">
      {editor.mode === 'source' && selected && !selected.error && selected.kind !== 'audio' && <Media key={selected.id} asset={selected} editor={editor} visual master={selected.kind === 'video'} />}
      {editor.mode === 'timeline' && timeline.filter(({ a }) => a.kind === 'video').map(({ a, c }) => <Media key={c.id} asset={a} clip={c} editor={editor} visual master={c.id === activeVideoId} />)}
      {editor.mode === 'timeline' && activeVisual?.a.kind === 'image' && <Media key={activeVisual.c.id} asset={activeVisual.a} clip={activeVisual.c} editor={editor} visual />}
      {((editor.mode === 'source' && (!selected || selected.error)) || (editor.mode === 'timeline' && !activeVisual)) && <p>{editor.mode === 'timeline' ? 'No video at the playhead' : 'No media selected'}</p>}
    </div>
    {editor.mode === 'source' && selected?.kind === 'audio' && <Media key={selected.id} asset={selected} editor={editor} master />}
    {editor.mode === 'timeline' && timeline.filter(({ a }) => a.kind === 'audio').map(({ a, c }) => <Media key={c.id} asset={a} clip={c} editor={editor} />)}
  </div>;
}