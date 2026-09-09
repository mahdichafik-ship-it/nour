import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_PROJECT_SETTINGS, type EditorController, type MediaAsset, type MediaKind, type NativeMediaFile, type ProjectSettings, type TimelineClip, type Track, type StoryRole, type TextOverlay, type TextOverlayKind } from './types';

type StoredProject = { projectName: string; projectSettings?: ProjectSettings; assets: Omit<MediaAsset, 'src'>[]; clips: TimelineClip[]; overlays: TextOverlay[]; trackMuted: Record<Track, boolean> };
const PROJECT_KEY = 'nour-editor-project-v1';
const IMAGE_DURATION = 5;
const extensions: Record<MediaKind, string[]> = {
  video: ['mp4', 'webm', 'mov', 'm4v', 'ogv'],
  audio: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'flac'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp'],
};
type TauriWindow = Window & { __TAURI__?: { core?: { invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>; convertFileSrc?: (path: string, protocol?: string) => string } } };
const nativeWindow = () => window as TauriWindow;
const tauri = () => nativeWindow().__TAURI__?.core;
const fileKind = (name: string, type = ''): MediaKind | null => {
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('image/')) return 'image';
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return (Object.keys(extensions) as MediaKind[]).find(kind => extensions[kind].includes(ext)) ?? null;
};
const id = () => crypto.randomUUID();
const finite = (n: number, fallback = 0) => Number.isFinite(n) ? n : fallback;
const normalizeProjectSettings = (value?: Partial<ProjectSettings>): ProjectSettings => ({ ...DEFAULT_PROJECT_SETTINGS, ...value });
const DEMO_ASSET_ID = 'nour-demo-frame';
const DEMO_ASSET_SRC = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#182a2c"/><stop offset="0.52" stop-color="#295050"/><stop offset="1" stop-color="#d49a62"/></linearGradient><linearGradient id="sun" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f5d6a0"/><stop offset="1" stop-color="#d0744d"/></linearGradient></defs><rect width="1920" height="1080" fill="url(#bg)"/><circle cx="1510" cy="260" r="170" fill="url(#sun)" opacity=".92"/><path d="M0 790 360 470l260 230 300-360 420 450 240-220 340 330v180H0Z" fill="#102223" opacity=".9"/><path d="M0 875h1920" stroke="#f4d39c" stroke-width="4" opacity=".7"/><text x="120" y="150" fill="#fff4df" font-family="Arial,sans-serif" font-size="34" letter-spacing="8">NOUR / FIRST CUT</text><text x="120" y="955" fill="#fff4df" font-family="Arial,sans-serif" font-size="72" font-weight="700">A SIMPLE STORY</text><text x="124" y="1008" fill="#f4d39c" font-family="Arial,sans-serif" font-size="24" letter-spacing="4">SAMPLE PROJECT · READY TO EDIT</text></svg>`)}`;
const roleForKind = (kind: MediaKind): StoryRole => kind === 'audio' ? 'audio' : kind === 'image' ? 'image' : 'a-roll';
const demoAsset = (): MediaAsset => ({ id: DEMO_ASSET_ID, name: 'Nour sample frame.svg', kind: 'image', role: 'image', src: DEMO_ASSET_SRC, duration: 6, width: 1920, height: 1080, demo: true });
export function hasTrackOverlap(clips: TimelineClip[], candidate: TimelineClip): boolean {
  const end = candidate.start + candidate.duration;
  return clips.some(clip => clip.id !== candidate.id && clip.track === candidate.track && candidate.start < clip.start + clip.duration && end > clip.start);
}
export function splitTimelineClip(clip: TimelineClip, playhead: number, newId: string): [TimelineClip, TimelineClip] | null {
  const cut = playhead - clip.start;
  if (cut <= 0.05 || cut >= clip.duration - 0.05) return null;
  return [
    { ...clip, duration: cut },
    { ...clip, id: newId, start: playhead, trimStart: clip.trimStart + cut, duration: clip.duration - cut },
  ];
}
export function isTextOverlayActive(overlay: TextOverlay, time: number): boolean {
  return Number.isFinite(time) && time >= overlay.start && time < overlay.start + overlay.duration;
}
const db = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open('nour-editor-media-v1', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('blobs');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
async function blobPut(key: string, blob: Blob) { const d = await db(); await new Promise<void>((ok, no) => { const tx = d.transaction('blobs', 'readwrite'); tx.objectStore('blobs').put(blob, key); tx.oncomplete = () => ok(); tx.onerror = () => no(tx.error); tx.onabort = () => no(tx.error); }); d.close(); }
async function blobGet(key: string) { const d = await db(); const result = await new Promise<Blob | undefined>((ok, no) => { const r = d.transaction('blobs').objectStore('blobs').get(key); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }); d.close(); return result; }
function probe(src: string, kind: MediaKind): Promise<Pick<MediaAsset, 'duration' | 'width' | 'height'>> {
  if (kind === 'image') return new Promise((resolve, reject) => { const image = new Image(), timer = setTimeout(() => done(new Error('Timed out loading image metadata.')), 15000); const done = (error?: Error) => { clearTimeout(timer); image.onload = image.onerror = null; error ? reject(error) : resolve({ duration: IMAGE_DURATION, width: image.naturalWidth, height: image.naturalHeight }); }; image.onload = () => done(); image.onerror = () => done(new Error('This image could not be decoded.')); image.src = src; });
  return new Promise((resolve, reject) => {
    const element = document.createElement(kind === 'video' ? 'video' : 'audio'), timer = setTimeout(() => done(undefined, new Error(`Timed out loading ${kind} metadata.`)), 15000);
    const done = (value?: Pick<MediaAsset, 'duration' | 'width' | 'height'>, error?: Error) => { clearTimeout(timer); element.onloadedmetadata = element.onerror = null; error ? reject(error) : resolve(value!); };
    element.preload = 'metadata';
    element.onloadedmetadata = () => {
      const video = element as HTMLVideoElement;
      const duration = element.duration;
      if (!Number.isFinite(duration) || duration <= 0) return done(undefined, new Error(`This ${kind} has an invalid duration.`));
      done({ duration, width: kind === 'video' ? video.videoWidth : undefined, height: kind === 'video' ? video.videoHeight : undefined });
    };
    element.onerror = () => done(undefined, new Error(`This ${kind} is unsupported or could not be decoded by this browser.`));
    element.src = src;
  });
}

export function useEditorEngine(): EditorController {
  const native = !!tauri();
  const [projectName, setProjectName] = useState('Untitled project');
  const [projectSettings, setProjectSettings] = useState<ProjectSettings>(DEFAULT_PROJECT_SETTINGS);
  const [hasProject, setHasProject] = useState(false);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [clips, setClips] = useState<TimelineClip[]>([]);
  const [overlays, setOverlays] = useState<TextOverlay[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [mode, setModeState] = useState<'source' | 'timeline'>('source');
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playbackReady, setPlaybackReadyState] = useState(false);
  const [mediaClockActive, setMediaClockActiveState] = useState(false);
  const [seekRevision, setSeekRevision] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [trackMuted, setTrackMuted] = useState<Record<Track, boolean>>({ video: false, audio: false });
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<EditorController['saveStatus']>('loading');
  const ready = useRef(false), urls = useRef(new Set<string>()), importChain = useRef(Promise.resolve()), saveChain = useRef(Promise.resolve());
  type Snapshot = { projectName: string; projectSettings: ProjectSettings; hasProject: boolean; assets: MediaAsset[]; clips: TimelineClip[]; overlays: TextOverlay[]; trackMuted: Record<Track, boolean> };
  const history = useRef<Snapshot[]>([]), future = useRef<Snapshot[]>([]);
  const [, refreshHistory] = useState(0);
  const latestProject = useRef<StoredProject>({ projectName: 'Untitled project', projectSettings: DEFAULT_PROJECT_SETTINGS, assets: [], clips: [], overlays: [], trackMuted: { video: false, audio: false } });
  const assetsRef = useRef(assets), clipsRef = useRef(clips), overlaysRef = useRef(overlays), modeRef = useRef(mode), selectedRef = useRef(selectedAssetId), timeRef = useRef(0);
  const projectNameRef = useRef(projectName), settingsRef = useRef(projectSettings), hasProjectRef = useRef(hasProject), trackMutedRef = useRef(trackMuted);
  useEffect(() => { assetsRef.current = assets; }, [assets]);
  useEffect(() => { clipsRef.current = clips; }, [clips]);
  useEffect(() => { overlaysRef.current = overlays; }, [overlays]);
  useEffect(() => { projectNameRef.current = projectName; }, [projectName]);
  useEffect(() => { settingsRef.current = projectSettings; }, [projectSettings]);
  useEffect(() => { hasProjectRef.current = hasProject; }, [hasProject]);
  useEffect(() => { trackMutedRef.current = trackMuted; }, [trackMuted]);
  useEffect(() => { modeRef.current = mode; selectedRef.current = selectedAssetId; }, [mode, selectedAssetId]);
  const snapshot = useCallback((): Snapshot => ({
    projectName: projectNameRef.current, projectSettings: settingsRef.current, hasProject: hasProjectRef.current,
    assets: assetsRef.current, clips: clipsRef.current, overlays: overlaysRef.current, trackMuted: trackMutedRef.current,
  }), []);
  const recordHistory = useCallback(() => {
    history.current = [...history.current, snapshot()].slice(-100);
    future.current = [];
    refreshHistory(value => value + 1);
  }, [snapshot]);

  const duration = useMemo(() => Math.max(0, ...clips.map(c => c.start + c.duration)), [clips]);
  const playbackDuration = mode === 'source' ? (assets.find(a => a.id === selectedAssetId)?.duration ?? 0) : duration;
  const durationRef = useRef(playbackDuration); useEffect(() => { durationRef.current = playbackDuration; }, [playbackDuration]);
  const reportError = useCallback((message: string) => { setPlaying(false); setBuffering(false); setError(message); }, []);
  const previewSeek = useCallback((seconds: number) => {
    if (!ready.current) return;
    const next = Math.min(durationRef.current, Math.max(0, finite(seconds)));
    setPlaying(false);
    setBuffering(false);
    timeRef.current = next;
    setCurrentTime(next);
  }, []);
  const commitSeek = useCallback((seconds: number) => {
    if (!ready.current) return;
    const next = Math.min(durationRef.current, Math.max(0, finite(seconds)));
    setPlaying(false);
    setBuffering(false);
    timeRef.current = next;
    setCurrentTime(next);
    setSeekRevision(value => value + 1);
  }, []);
  const seek = commitSeek;
  const setPlaybackReady = useCallback((value: boolean) => setPlaybackReadyState(value), []);
  const setMediaClockActive = useCallback((value: boolean) => setMediaClockActiveState(value), []);
  useEffect(() => setBuffering(playing && !playbackReady), [playing, playbackReady]);
  const syncPlaybackTime = useCallback((seconds: number) => {
    if (!Number.isFinite(seconds)) return;
    timeRef.current = Math.min(durationRef.current, Math.max(0, seconds));
    setCurrentTime(timeRef.current);
    if (timeRef.current >= durationRef.current) setPlaying(false);
  }, []);
  const pauseReset = useCallback(() => { setPlaying(false); setBuffering(false); setCurrentTime(0); }, []);
  const setMode = useCallback((next: 'source' | 'timeline') => { if (!ready.current) return; pauseReset(); modeRef.current = next; durationRef.current = next === 'timeline' ? Math.max(0, ...clipsRef.current.map(c => c.start + c.duration)) : (assetsRef.current.find(a => a.id === selectedRef.current)?.duration ?? 0); setModeState(next); }, [pauseReset]);
  const selectAsset = useCallback((assetId: string) => { if (!ready.current) return; setPlaying(false); setCurrentTime(0); setSelectedClipId(null); setSelectedAssetId(assetId); selectedRef.current = assetId; modeRef.current = 'source'; setModeState('source'); }, []);
  const selectClip = useCallback((clipId: string) => { if (!ready.current) return; const clip = clipsRef.current.find(c => c.id === clipId); setPlaying(false); setCurrentTime(clip?.start ?? 0); setSelectedAssetId(null); selectedRef.current = null; setSelectedClipId(clipId); modeRef.current = 'timeline'; durationRef.current = Math.max(0, ...clipsRef.current.map(c => c.start + c.duration)); setModeState('timeline'); }, []);

  useEffect(() => {
    let frame = 0, last = 0;
    const tick = (now: number) => { if (!last) last = now; const next = timeRef.current + (now - last) / 1000; last = now; if (next >= durationRef.current) { timeRef.current = durationRef.current; setCurrentTime(durationRef.current); setPlaying(false); return; } timeRef.current = next; setCurrentTime(next); frame = requestAnimationFrame(tick); };
    if (playing && playbackReady && !mediaClockActive && durationRef.current > 0) frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, playbackReady, mediaClockActive]);
  useEffect(() => { timeRef.current = currentTime; }, [currentTime]);
  useEffect(() => {
    latestProject.current = { projectName, projectSettings, assets: assets.map(({ src, ...a }) => a), clips, overlays, trackMuted };
  }, [projectName, projectSettings, assets, clips, trackMuted]);
  useEffect(() => {
    if (native) return;
    const flush = () => { if (ready.current) localStorage.setItem(PROJECT_KEY, JSON.stringify(latestProject.current)); };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => { window.removeEventListener('pagehide', flush); window.removeEventListener('beforeunload', flush); };
  }, [native]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let restoredSuccessfully = false;
      try {
        const stored = native ? await tauri()?.invoke<string | null>('load_editor_state') : localStorage.getItem(PROJECT_KEY);
        if (!stored) { restoredSuccessfully = true; if (!cancelled) setSaveStatus('saved'); return; }
        const data = JSON.parse(stored) as StoredProject;
        if (!data || !Array.isArray(data.assets) || !Array.isArray(data.clips)) throw new Error('Invalid project format');
        const restored = await Promise.all((data.assets || []).map(async asset => {
          let src = '';
          if (asset.nativePath) src = nativeWindow().__TAURI__?.core?.convertFileSrc?.(asset.nativePath) ?? '';
           else if (asset.demo) src = DEMO_ASSET_SRC;
           else { const blob = await blobGet(asset.id); if (blob) { src = URL.createObjectURL(blob); urls.current.add(src); } }
           return { ...asset, role: asset.role ?? roleForKind(asset.kind), src, error: src ? asset.error : 'Media file is unavailable locally.' };
        }));
        restoredSuccessfully = true;
         if (!cancelled) { setProjectName(data.projectName || 'Untitled project'); projectNameRef.current = data.projectName || 'Untitled project'; setProjectSettings(normalizeProjectSettings(data.projectSettings)); settingsRef.current = normalizeProjectSettings(data.projectSettings); setAssets(restored); assetsRef.current = restored; setClips(data.clips || []); clipsRef.current = data.clips || []; setOverlays(data.overlays || []); overlaysRef.current = data.overlays || []; setTrackMuted(data.trackMuted || { video: false, audio: false }); trackMutedRef.current = data.trackMuted || { video: false, audio: false }; setHasProject(true); hasProjectRef.current = true; setSaveStatus('saved'); }
      } catch { if (!cancelled) { setError('Could not restore the saved project.'); setSaveStatus('error'); } }
      finally { if (!cancelled && restoredSuccessfully) ready.current = true; }
    })();
    return () => { cancelled = true; };
  }, [native]);
  useEffect(() => () => { urls.current.forEach(URL.revokeObjectURL); }, []);
  useEffect(() => {
    if (!ready.current) return;
    const timer = window.setTimeout(() => {
       const data: StoredProject = { projectName, projectSettings, assets: assets.map(({ src, ...a }) => a), clips, overlays, trackMuted };
      saveChain.current = saveChain.current.then(async () => {
        setSaveStatus('saving');
        try { if (native) await tauri()?.invoke('save_editor_state', { contents: JSON.stringify(data) }); else localStorage.setItem(PROJECT_KEY, JSON.stringify(data)); setSaveStatus('saved'); }
        catch { setSaveStatus('error'); setError('Could not save this project locally.'); }
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [projectName, projectSettings, assets, clips, overlays, trackMuted, native, hasProject]);

  const restoreSnapshot = useCallback((value: Snapshot) => {
    assetsRef.current = value.assets; clipsRef.current = value.clips; overlaysRef.current = value.overlays; trackMutedRef.current = value.trackMuted;
    projectNameRef.current = value.projectName; settingsRef.current = value.projectSettings;
    hasProjectRef.current = value.hasProject;
    setProjectName(value.projectName); setProjectSettings(value.projectSettings); setHasProject(value.hasProject);
    setAssets(value.assets); setClips(value.clips); setOverlays(value.overlays); setTrackMuted(value.trackMuted);
    durationRef.current = modeRef.current === 'timeline' ? Math.max(0, ...value.clips.map(c => c.start + c.duration)) : (value.assets.find(a => a.id === selectedRef.current)?.duration ?? 0);
    setPlaying(false);
  }, []);
  const undo = useCallback(() => {
    const previous = history.current.pop(); if (!previous) return;
    future.current.push(snapshot()); restoreSnapshot(previous); refreshHistory(value => value + 1);
  }, [restoreSnapshot, snapshot]);
  const redo = useCallback(() => {
    const next = future.current.pop(); if (!next) return;
    history.current.push(snapshot()); restoreSnapshot(next); refreshHistory(value => value + 1);
  }, [restoreSnapshot, snapshot]);

  const addToTimeline = useCallback((assetId: string, start?: number, track?: Track) => {
    if (!ready.current) return;
    const asset = assetsRef.current.find(a => a.id === assetId); if (!asset || asset.error) return;
    const target = track ?? (asset.kind === 'audio' ? 'audio' : 'video');
    if ((asset.kind === 'audio') !== (target === 'audio')) { setError('Audio clips belong on the audio track; video and images belong on the video track.'); return; }
    const end = Math.max(0, ...clipsRef.current.filter(c => c.track === target).map(c => c.start + c.duration));
    const clip: TimelineClip = { id: id(), assetId, track: target, start: Math.max(0, finite(start ?? end)), trimStart: 0, duration: asset.duration || IMAGE_DURATION, volume: 1, muted: false };
    if (hasTrackOverlap(clipsRef.current, clip)) { setError('That position overlaps another clip on this track. Choose a free space.'); return; }
    recordHistory();
    const next = [...clipsRef.current, clip]; clipsRef.current = next; setClips(next); setPlaying(false); setCurrentTime(clip.start); setSelectedAssetId(null); selectedRef.current = null; setSelectedClipId(clip.id); modeRef.current = 'timeline'; durationRef.current = Math.max(0, ...next.map(c => c.start + c.duration)); setModeState('timeline');
  }, [recordHistory]);
  const moveClip = useCallback((clipId: string, start: number, track?: Track) => {
    if (!ready.current) return;
    const current = clipsRef.current.find(c => c.id === clipId), asset = current && assetsRef.current.find(a => a.id === current.assetId);
    if (!current || !asset) return; const target = track ?? current.track;
    if ((asset.kind === 'audio') !== (target === 'audio')) { setError('Audio clips belong on the audio track; video and images belong on the video track.'); return; }
    const candidate = { ...current, start: Math.max(0, finite(start)), track: target };
    if (hasTrackOverlap(clipsRef.current, candidate)) { setError('That position overlaps another clip on this track. Choose a free space.'); return; }
    recordHistory();
    const next = clipsRef.current.map(c => c.id === clipId ? candidate : c); clipsRef.current = next; setClips(next);
  }, [recordHistory]);
  const updateClip = useCallback((clipId: string, changes: Partial<Pick<TimelineClip, 'start' | 'trimStart' | 'duration' | 'volume' | 'muted'>>) => {
    if (!ready.current) return; const current = clipsRef.current.find(c => c.id === clipId); if (!current) return;
    const asset = assetsRef.current.find(a => a.id === current.assetId); const source = asset?.duration ?? current.duration + current.trimStart; const trimStart = Math.min(Math.max(0, finite(changes.trimStart ?? current.trimStart)), Math.max(0, source - .05)); const max = source - trimStart;
    const candidate = { ...current, ...changes, start: Math.max(0, finite(changes.start ?? current.start)), trimStart, duration: Math.min(max, Math.max(.05, finite(changes.duration ?? current.duration))), volume: Math.min(1, Math.max(0, finite(changes.volume ?? current.volume))) };
    if (hasTrackOverlap(clipsRef.current, candidate)) { setError('That edit overlaps another clip on this track. Choose a free space.'); return; }
    recordHistory();
    const next = clipsRef.current.map(c => c.id === clipId ? candidate : c); clipsRef.current = next; setClips(next);
  }, [recordHistory]);
  const removeClip = useCallback((clipId: string) => { if (!ready.current || !clipsRef.current.some(c => c.id === clipId)) return; recordHistory(); const next = clipsRef.current.filter(c => c.id !== clipId); clipsRef.current = next; setClips(next); if (selectedClipId === clipId) setSelectedClipId(null); }, [recordHistory, selectedClipId]);
  const removeAsset = useCallback((assetId: string) => {
    if (!ready.current) return;
    const asset = assetsRef.current.find(a => a.id === assetId);
    if (!asset) return;
    recordHistory();
    const nextAssets = assetsRef.current.filter(a => a.id !== assetId), nextClips = clipsRef.current.filter(c => c.assetId !== assetId);
    assetsRef.current = nextAssets; clipsRef.current = nextClips; setAssets(nextAssets); setClips(nextClips);
    if (selectedAssetId === assetId) { selectedRef.current = null; pauseReset(); }
  }, [pauseReset, recordHistory, selectedAssetId]);

  const updateAssetAdjustments = useCallback((assetId: string, changes: Partial<{ exposure: number, contrast: number, saturation: number }>) => {
    if (!ready.current) return;
    recordHistory(); const next = assetsRef.current.map(a => a.id === assetId ? { ...a, adjustments: { exposure: 1, contrast: 1, saturation: 1, ...a.adjustments, ...changes } } : a); assetsRef.current = next; setAssets(next);
  }, [recordHistory]);

  const resetAssetAdjustments = useCallback((assetId: string) => {
    if (!ready.current) return;
    recordHistory(); const next = assetsRef.current.map(a => {
      if (a.id === assetId) {
        const { adjustments, ...rest } = a;
        return rest;
      }
      return a;
    }); assetsRef.current = next; setAssets(next);
  }, [recordHistory]);

  const setAssetRole = useCallback((assetId: string, role: StoryRole) => {
    if (!ready.current || !assetsRef.current.some(a => a.id === assetId)) return;
    recordHistory(); const next = assetsRef.current.map(a => a.id === assetId ? { ...a, role } : a);
    assetsRef.current = next; setAssets(next);
  }, [recordHistory]);

  const splitClipAtPlayhead = useCallback((clipId?: string) => {
    if (!ready.current) return;
    const clip = clipsRef.current.find(c => c.id === (clipId ?? selectedClipId));
    if (!clip) { setError('Select a timeline clip before splitting.'); return; }
    const split = splitTimelineClip(clip, currentTime, id());
    if (!split) { setError('Move the playhead inside the selected clip before splitting.'); return; }
    const [left, right] = split;
    recordHistory();
    const next = clipsRef.current.map(c => c.id === clip.id ? left : c).concat(right);
    clipsRef.current = next; setClips(next); setSelectedClipId(right.id); setCurrentTime(right.start);
  }, [currentTime, recordHistory, selectedClipId]);
  const addOverlay = useCallback((kind: TextOverlayKind) => {
    if (!ready.current) return;
    recordHistory();
    const overlay: TextOverlay = { id: id(), kind, text: kind === 'title' ? 'Title' : 'Caption', start: Math.max(0, currentTime), duration: 3, position: kind === 'title' ? 'top' : 'bottom' };
    const next = [...overlaysRef.current, overlay]; overlaysRef.current = next; setOverlays(next);
  }, [currentTime, recordHistory]);
  const updateOverlay = useCallback((overlayId: string, changes: Partial<Pick<TextOverlay, 'kind' | 'text' | 'start' | 'duration' | 'position'>>) => {
    if (!ready.current) return;
    const current = overlaysRef.current.find(o => o.id === overlayId); if (!current) return;
    const nextOverlay = { ...current, ...changes, text: String(changes.text ?? current.text), start: Math.max(0, finite(changes.start ?? current.start)), duration: Math.max(.1, finite(changes.duration ?? current.duration)) };
    recordHistory(); const next = overlaysRef.current.map(o => o.id === overlayId ? nextOverlay : o); overlaysRef.current = next; setOverlays(next);
  }, [recordHistory]);
  const removeOverlay = useCallback((overlayId: string) => {
    if (!ready.current || !overlaysRef.current.some(o => o.id === overlayId)) return;
    recordHistory(); const next = overlaysRef.current.filter(o => o.id !== overlayId); overlaysRef.current = next; setOverlays(next);
  }, [recordHistory]);

  const importFiles = useCallback(async (input: FileList | File[]) => {
    if (!ready.current) { setError('Wait for the project to finish loading before importing.'); return; }
    if (native) { setError('Use the desktop Import picker to add media in the native app.'); return; }
    const files = Array.from(input); importChain.current = importChain.current.then(async () => {
      let recorded = false;
      setImporting(true); setError(null);
      for (const file of files) {
        const kind = fileKind(file.name, file.type); if (!kind) { setError(`Unsupported file: ${file.name}`); continue; }
        const assetId = id(), src = URL.createObjectURL(file); urls.current.add(src);
         try { const meta = await probe(src, kind); await blobPut(assetId, file); const asset = { id: assetId, name: file.name, kind, role: roleForKind(kind), src, size: file.size, ...meta }; if (!recorded) { recordHistory(); recorded = true; } const next = [...assetsRef.current, asset]; assetsRef.current = next; setAssets(next); if (!selectedRef.current) { selectedRef.current = assetId; modeRef.current = 'source'; setSelectedAssetId(assetId); setSelectedClipId(null); setModeState('source'); setCurrentTime(0); } }
        catch (e) { URL.revokeObjectURL(src); urls.current.delete(src); setError(`${file.name}: ${(e as Error).message}`); }
      } setImporting(false);
    }); return importChain.current;
  }, [native, recordHistory]);
  const importNative = useCallback(async () => {
    if (!ready.current) { setError('Wait for the project to finish loading before importing.'); return; }
    if (!native || !tauri()) { setError('Native file import is only available in the desktop app.'); return; }
    setImporting(true); setError(null);
    try {
      const files = await tauri()!.invoke<NativeMediaFile[]>('import_media');
       let recorded = false;
       for (const file of files) { const kind = fileKind(file.name); if (!kind) { setError(`Unsupported file: ${file.name}`); continue; } const src = nativeWindow().__TAURI__?.core?.convertFileSrc?.(file.path) ?? ''; if (!src) { setError(`${file.name}: native media URL could not be created.`); continue; } try { const meta = await probe(src, kind); const assetId = id(); const asset = { id: assetId, name: file.name, kind, role: roleForKind(kind), src, nativePath: file.path, size: file.size, ...meta }; if (!recorded) { recordHistory(); recorded = true; } const next = [...assetsRef.current, asset]; assetsRef.current = next; setAssets(next); if (!selectedRef.current) { selectedRef.current = assetId; modeRef.current = 'source'; setSelectedAssetId(assetId); setSelectedClipId(null); setModeState('source'); setCurrentTime(0); } } catch (e) { setError(`${file.name}: ${(e as Error).message}`); } }
    } catch (e) { setError(`Could not import media: ${(e as Error).message}`); }
    finally { setImporting(false); }
  }, [native, recordHistory]);
  const createProject = useCallback((name: string, settings: ProjectSettings) => {
    recordHistory();
    ready.current = true;
    pauseReset();
    assetsRef.current = [];
    clipsRef.current = [];
    overlaysRef.current = [];
    selectedRef.current = null;
    modeRef.current = 'source';
    const nextName = name.trim() || 'Untitled project';
    projectNameRef.current = nextName; settingsRef.current = settings; hasProjectRef.current = true; trackMutedRef.current = { video: false, audio: false };
    setProjectName(nextName);
    setProjectSettings(settings);
    setHasProject(true);
    setAssets([]);
    setClips([]);
    setOverlays([]);
    setSelectedAssetId(null);
    setSelectedClipId(null);
    setTrackMuted({ video: false, audio: false });
    setModeState('source');
    setSaveStatus('saving');
    setError(null);
  }, [pauseReset, recordHistory]);
  const createSampleProject = useCallback((settings: ProjectSettings) => {
    recordHistory();
    const asset = demoAsset();
    const clip: TimelineClip = { id: 'nour-demo-clip', assetId: asset.id, track: 'video', start: 0, trimStart: 0, duration: asset.duration, volume: 1, muted: false };
    ready.current = true;
    pauseReset();
    assetsRef.current = [asset];
    clipsRef.current = [clip];
    overlaysRef.current = [];
    selectedRef.current = asset.id;
    modeRef.current = 'timeline';
    projectNameRef.current = 'Nour first cut'; settingsRef.current = settings; hasProjectRef.current = true; trackMutedRef.current = { video: false, audio: false };
    setProjectName('Nour first cut');
    setProjectSettings(settings);
    setHasProject(true);
    setAssets([asset]);
    setClips([clip]);
    setOverlays([]);
    setSelectedAssetId(asset.id);
    setSelectedClipId(clip.id);
    setTrackMuted({ video: false, audio: false });
    setModeState('timeline');
    durationRef.current = asset.duration;
    setSaveStatus('saving');
    setError(null);
  }, [pauseReset, recordHistory]);
  const exportProject = useCallback(() => { const data: StoredProject = { projectName, projectSettings, assets: assets.map(({ src, ...a }) => a), clips, overlays, trackMuted }; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); a.download = `${projectName || 'project'}.nour.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 0); }, [projectName, projectSettings, assets, clips, overlays, trackMuted]);
  const exportVideo = useCallback(async () => {
    if (!native || !tauri()) { setError('Finished-video export is desktop-only. Use Export JSON in the browser to save project metadata.'); return null; }
    setError(null);
    try {
      return await tauri()!.invoke<string>('export_video', { request: JSON.stringify({ projectName, ...projectSettings, assets: assets.map(({ src, ...asset }) => asset), clips, overlays, trackMuted }) });
    } catch (e) { const message = String(e); if (message !== 'Export cancelled.') setError(message); return null; }
  }, [assets, clips, native, overlays, projectName, projectSettings, trackMuted]);

  return { projectName, setProjectName: name => { if (ready.current) { recordHistory(); projectNameRef.current = name; setProjectName(name); } }, projectSettings, hasProject, createProject, createSampleProject, assets, clips, overlays, selectedAssetId, selectedClipId, selectAsset, selectClip, mode, setMode, currentTime, seek, previewSeek, commitSeek, playing, togglePlay: () => { if (!ready.current) return; if (!playbackDuration) { reportError('Select supported media or add a clip before playing.'); return; } if (currentTime >= playbackDuration) { timeRef.current = 0; setCurrentTime(0); setSeekRevision(value => value + 1); } setPlaying(p => !p); }, playbackReady, buffering, setPlaybackReady, setMediaClockActive, syncPlaybackTime, seekRevision, duration, playbackDuration, volume, setVolume: v => setVolume(Math.min(1, Math.max(0, v))), muted, setMuted, trackMuted, toggleTrackMute: track => { recordHistory(); const next = { ...trackMutedRef.current, [track]: !trackMutedRef.current[track] }; trackMutedRef.current = next; setTrackMuted(next); }, addToTimeline, moveClip, updateClip, removeClip, removeAsset, updateAssetAdjustments, resetAssetAdjustments, setAssetRole, splitClipAtPlayhead, addOverlay, updateOverlay, removeOverlay, canUndo: history.current.length > 0, canRedo: future.current.length > 0, undo, redo, importFiles, importNative, importing, isNative: native, error, reportError, clearError: () => setError(null), saveStatus, exportProject, exportVideo };
}