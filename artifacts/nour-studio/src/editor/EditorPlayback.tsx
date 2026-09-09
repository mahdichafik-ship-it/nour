import { useEffect, useMemo, useRef, type RefObject } from 'react';
import type { EditorController, MediaAsset, TimelineClip, TextOverlay } from './types';
import { shouldSeekMedia } from './playback-sync';

function sync(el: HTMLMediaElement | null, time: number, active: boolean, shouldPlay: boolean, master: boolean, forceSeek: boolean, volume: number, muted: boolean, report: (s: string) => void, failed?: () => void) {
  if (!el) return;
  el.volume = Math.max(0, Math.min(1, volume)); el.muted = muted;
  if (!active) { if (!el.paused) el.pause(); return; }
  if (el.readyState < HTMLMediaElement.HAVE_METADATA) return;
  if (shouldSeekMedia({ currentTime: el.currentTime, targetTime: time, active, playing: shouldPlay, master, forced: forceSeek })) el.currentTime = Math.max(0, time);
  if (shouldPlay && el.paused) void el.play().catch(() => { failed?.(); report('Playback was blocked or this media format is unsupported.'); });
  if (!shouldPlay && !el.paused) el.pause();
}
function Media({ asset, clip, editor, visual = false, master = false }: { asset: MediaAsset; clip?: TimelineClip; editor: EditorController; visual?: boolean; master?: boolean }) {
  const ref = useRef<HTMLMediaElement>(null);
  const rejected = useRef(false);
  const wasActive = useRef(false);
  const appliedSeekRevision = useRef(-1);
  const local = clip ? editor.currentTime - clip.start + clip.trimStart : editor.currentTime;
  const active = !clip || (editor.currentTime >= clip.start && editor.currentTime < clip.start + clip.duration);
  const effectiveVolume = (clip?.volume ?? 1) * editor.volume;
  const effectiveMuted = editor.muted || !!clip?.muted || (!!clip && editor.trackMuted[clip.track]);
  const attempt = editor.playing && active && !rejected.current;
  useEffect(() => {
    const forceSeek = (active && !wasActive.current) || appliedSeekRevision.current !== editor.seekRevision;
    sync(ref.current, local, active, attempt, master, forceSeek, effectiveVolume, effectiveMuted, editor.reportError, () => { rejected.current = true; });
    wasActive.current = active;
    appliedSeekRevision.current = editor.seekRevision;
  }, [local, active, attempt, master, effectiveVolume, effectiveMuted, editor.reportError, editor.seekRevision]);
  useEffect(() => {
    if (master) editor.setPlaybackReady((ref.current?.readyState ?? 0) >= HTMLMediaElement.HAVE_FUTURE_DATA);
  }, [master, editor.setPlaybackReady]);
  useEffect(() => { if (!editor.playing) rejected.current = false; }, [editor.playing]);
  const onMetadata = () => sync(ref.current, local, active, attempt, master, true, effectiveVolume, effectiveMuted, editor.reportError, () => { rejected.current = true; });
  const onError = () => { rejected.current = true; editor.reportError(`${asset.name} could not be played because its format is unsupported or corrupt.`); };
  const metadata = () => {
    onMetadata();
    if (master) editor.setPlaybackReady((ref.current?.readyState ?? 0) >= HTMLMediaElement.HAVE_FUTURE_DATA);
  };
  const readiness = () => { onMetadata(); if (master) editor.setPlaybackReady(true); };
  const waiting = () => { if (master) editor.setPlaybackReady(false); };
  const timeUpdate = () => { if (master && editor.playing && ref.current) editor.syncPlaybackTime(clip ? clip.start + ref.current.currentTime - clip.trimStart : ref.current.currentTime); };
  const ended = () => {
    if (!master) return;
    const end = clip ? clip.start + clip.duration : asset.duration;
    editor.syncPlaybackTime(end);
    editor.setPlaybackReady(true);
  };
  const filterStyle = asset.adjustments ? `brightness(${asset.adjustments.exposure}) contrast(${asset.adjustments.contrast}) saturate(${asset.adjustments.saturation})` : undefined;
  const common = { src: asset.src, onLoadedMetadata: metadata, onLoadedData: readiness, onCanPlay: readiness, onPlaying: readiness, onWaiting: waiting, onSeeked: readiness, onTimeUpdate: timeUpdate, onEnded: ended, onError, onPlay: () => { rejected.current = false; } };
  if (asset.kind === 'image') return visual && active ? <img src={asset.src} alt={asset.name} style={{ display: active ? 'block' : 'none', filter: filterStyle }} /> : null;
  return asset.kind === 'video' && visual ? <video ref={ref as RefObject<HTMLVideoElement>} {...common} playsInline preload="auto" style={{ display: active ? 'block' : 'none', filter: filterStyle }} /> : <audio ref={ref as RefObject<HTMLAudioElement>} {...common} preload="auto" />;
}
export function EditorPlayback({ editor }: { editor: EditorController }) {
  const selected = editor.assets.find(a => a.id === editor.selectedAssetId);
  const timeline = useMemo(() => editor.clips.map(c => ({ c, a: editor.assets.find(a => a.id === c.assetId) })).filter((x): x is { c: TimelineClip; a: MediaAsset } => !!x.a && !x.a.error), [editor.clips, editor.assets]);
  const activeVisual = editor.mode === 'timeline' ? timeline.find(({ c, a }) => a.kind !== 'audio' && editor.currentTime >= c.start && editor.currentTime < c.start + c.duration) : undefined;
  const activeVideoId = activeVisual?.a.kind === 'video' ? activeVisual.c.id : null;
  const sourceMediaClock = editor.mode === 'source' && (selected?.kind === 'video' || selected?.kind === 'audio');
  const activeOverlays = editor.mode === 'timeline' ? editor.overlays.filter(o => editor.currentTime >= o.start && editor.currentTime < o.start + o.duration) : [];
  useEffect(() => {
    editor.setMediaClockActive(sourceMediaClock || !!activeVideoId);
    return () => editor.setMediaClockActive(false);
  }, [sourceMediaClock, activeVideoId, editor.setMediaClockActive]);
  useEffect(() => {
    if (!sourceMediaClock && !activeVideoId) editor.setPlaybackReady(true);
  }, [sourceMediaClock, activeVideoId, editor.setPlaybackReady]);
  return <div className="editor-playback">
    <div className="editor-playback-visual">
      {editor.mode === 'source' && selected && !selected.error && selected.kind !== 'audio' && <Media key={selected.id} asset={selected} editor={editor} visual master={selected.kind === 'video'} />}
      {editor.mode === 'timeline' && timeline.filter(({ a }) => a.kind === 'video').map(({ a, c }) => <Media key={c.id} asset={a} clip={c} editor={editor} visual master={c.id === activeVideoId} />)}
      {editor.mode === 'timeline' && activeVisual?.a.kind === 'image' && <Media key={activeVisual.c.id} asset={activeVisual.a} clip={activeVisual.c} editor={editor} visual />}
      {((editor.mode === 'source' && (!selected || selected.error)) || (editor.mode === 'timeline' && !activeVisual)) && <p>{editor.mode === 'timeline' ? 'No video at the playhead' : 'No media selected'}</p>}
       {activeOverlays.map(overlay => <TextOverlayView key={overlay.id} overlay={overlay} />)}
    </div>
    {editor.mode === 'source' && selected?.kind === 'audio' && <Media key={selected.id} asset={selected} editor={editor} master />}
    {editor.mode === 'timeline' && timeline.filter(({ a }) => a.kind === 'audio').map(({ a, c }) => <Media key={c.id} asset={a} clip={c} editor={editor} />)}
  </div>;
}

function TextOverlayView({ overlay }: { overlay: TextOverlay }) {
  return <div className={`text-overlay text-overlay-${overlay.position} text-overlay-${overlay.kind}`} aria-label={overlay.kind}>{overlay.text}</div>;
}