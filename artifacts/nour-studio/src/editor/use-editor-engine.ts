import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EditorController, MediaAsset, MediaKind, NativeMediaFile, TimelineClip, Track } from './types';

type StoredProject = { projectName: string; assets: Omit<MediaAsset, 'src'>[]; clips: TimelineClip[]; trackMuted: Record<Track, boolean> };
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
export function hasTrackOverlap(clips: TimelineClip[], candidate: TimelineClip): boolean {
  const end = candidate.start + candidate.duration;
  return clips.some(clip => clip.id !== candidate.id && clip.track === candidate.track && candidate.start < clip.start + clip.duration && end > clip.start);
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
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [clips, setClips] = useState<TimelineClip[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [mode, setModeState] = useState<'source' | 'timeline'>('source');
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playbackReady, setPlaybackReadyState] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [trackMuted, setTrackMuted] = useState<Record<Track, boolean>>({ video: false, audio: false });
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<EditorController['saveStatus']>('loading');
  const ready = useRef(false), urls = useRef(new Set<string>()), importChain = useRef(Promise.resolve()), saveChain = useRef(Promise.resolve());
  const latestProject = useRef<StoredProject>({ projectName: 'Untitled project', assets: [], clips: [], trackMuted: { video: false, audio: false } });
  const assetsRef = useRef(assets), clipsRef = useRef(clips), modeRef = useRef(mode), selectedRef = useRef(selectedAssetId), timeRef = useRef(0);
  useEffect(() => { assetsRef.current = assets; }, [assets]);
  useEffect(() => { clipsRef.current = clips; }, [clips]);
  useEffect(() => { modeRef.current = mode; selectedRef.current = selectedAssetId; }, [mode, selectedAssetId]);

  const duration = useMemo(() => Math.max(0, ...clips.map(c => c.start + c.duration)), [clips]);
  const playbackDuration = mode === 'source' ? (assets.find(a => a.id === selectedAssetId)?.duration ?? 0) : duration;
  const durationRef = useRef(playbackDuration); useEffect(() => { durationRef.current = playbackDuration; }, [playbackDuration]);
  const reportError = useCallback((message: string) => { setPlaying(false); setBuffering(false); setError(message); }, []);
  const seek = useCallback((seconds: number) => { if (ready.current) setCurrentTime(Math.min(durationRef.current, Math.max(0, finite(seconds)))); }, []);
  const setPlaybackReady = useCallback((value: boolean) => setPlaybackReadyState(value), []);
  useEffect(() => setBuffering(playing && !playbackReady), [playing, playbackReady]);
  const syncPlaybackTime = useCallback((seconds: number) => { if (Number.isFinite(seconds)) { timeRef.current = Math.min(durationRef.current, Math.max(0, seconds)); setCurrentTime(timeRef.current); } }, []);
  const pauseReset = useCallback(() => { setPlaying(false); setBuffering(false); setCurrentTime(0); }, []);
  const setMode = useCallback((next: 'source' | 'timeline') => { if (!ready.current) return; pauseReset(); modeRef.current = next; durationRef.current = next === 'timeline' ? Math.max(0, ...clipsRef.current.map(c => c.start + c.duration)) : (assetsRef.current.find(a => a.id === selectedRef.current)?.duration ?? 0); setModeState(next); }, [pauseReset]);
  const selectAsset = useCallback((assetId: string) => { if (!ready.current) return; setPlaying(false); setCurrentTime(0); setSelectedClipId(null); setSelectedAssetId(assetId); selectedRef.current = assetId; modeRef.current = 'source'; setModeState('source'); }, []);
  const selectClip = useCallback((clipId: string) => { if (!ready.current) return; const clip = clipsRef.current.find(c => c.id === clipId); setPlaying(false); setCurrentTime(clip?.start ?? 0); setSelectedAssetId(null); selectedRef.current = null; setSelectedClipId(clipId); modeRef.current = 'timeline'; durationRef.current = Math.max(0, ...clipsRef.current.map(c => c.start + c.duration)); setModeState('timeline'); }, []);

  useEffect(() => {
    let frame = 0, last = 0;
    const tick = (now: number) => { if (!last) last = now; const next = timeRef.current + (now - last) / 1000; last = now; if (next >= durationRef.current) { timeRef.current = durationRef.current; setCurrentTime(durationRef.current); setPlaying(false); return; } timeRef.current = next; setCurrentTime(next); frame = requestAnimationFrame(tick); };
    if (playing && playbackReady && durationRef.current > 0) frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, playbackReady]);
  useEffect(() => { timeRef.current = currentTime; }, [currentTime]);
  useEffect(() => {
    latestProject.current = { projectName, assets: assets.map(({ src, ...a }) => a), clips, trackMuted };
  }, [projectName, assets, clips, trackMuted]);
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
          else { const blob = await blobGet(asset.id); if (blob) { src = URL.createObjectURL(blob); urls.current.add(src); } }
          return { ...asset, src, error: src ? asset.error : 'Media file is unavailable locally.' };
        }));
        restoredSuccessfully = true;
        if (!cancelled) { setProjectName(data.projectName || 'Untitled project'); setAssets(restored); assetsRef.current = restored; setClips(data.clips || []); clipsRef.current = data.clips || []; setTrackMuted(data.trackMuted || { video: false, audio: false }); setSaveStatus('saved'); }
      } catch { if (!cancelled) { setError('Could not restore the saved project.'); setSaveStatus('error'); } }
      finally { if (!cancelled && restoredSuccessfully) ready.current = true; }
    })();
    return () => { cancelled = true; };
  }, [native]);
  useEffect(() => () => { urls.current.forEach(URL.revokeObjectURL); }, []);
  useEffect(() => {
    if (!ready.current) return;
    const timer = window.setTimeout(() => {
      const data: StoredProject = { projectName, assets: assets.map(({ src, ...a }) => a), clips, trackMuted };
      saveChain.current = saveChain.current.then(async () => {
        setSaveStatus('saving');
        try { if (native) await tauri()?.invoke('save_editor_state', { contents: JSON.stringify(data) }); else localStorage.setItem(PROJECT_KEY, JSON.stringify(data)); setSaveStatus('saved'); }
        catch { setSaveStatus('error'); setError('Could not save this project locally.'); }
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [projectName, assets, clips, trackMuted, native]);

  const addToTimeline = useCallback((assetId: string, start?: number, track?: Track) => {
    if (!ready.current) return;
    const asset = assetsRef.current.find(a => a.id === assetId); if (!asset || asset.error) return;
    const target = track ?? (asset.kind === 'audio' ? 'audio' : 'video');
    if ((asset.kind === 'audio') !== (target === 'audio')) { setError('Audio clips belong on the audio track; video and images belong on the video track.'); return; }
    const end = Math.max(0, ...clipsRef.current.filter(c => c.track === target).map(c => c.start + c.duration));
    const clip: TimelineClip = { id: id(), assetId, track: target, start: Math.max(0, finite(start ?? end)), trimStart: 0, duration: asset.duration || IMAGE_DURATION, volume: 1, muted: false };
    if (hasTrackOverlap(clipsRef.current, clip)) { setError('That position overlaps another clip on this track. Choose a free space.'); return; }
    const next = [...clipsRef.current, clip]; clipsRef.current = next; setClips(next); setPlaying(false); setCurrentTime(clip.start); setSelectedAssetId(null); selectedRef.current = null; setSelectedClipId(clip.id); modeRef.current = 'timeline'; durationRef.current = Math.max(0, ...next.map(c => c.start + c.duration)); setModeState('timeline');
  }, []);
  const moveClip = useCallback((clipId: string, start: number, track?: Track) => {
    if (!ready.current) return;
    const current = clipsRef.current.find(c => c.id === clipId), asset = current && assetsRef.current.find(a => a.id === current.assetId);
    if (!current || !asset) return; const target = track ?? current.track;
    if ((asset.kind === 'audio') !== (target === 'audio')) { setError('Audio clips belong on the audio track; video and images belong on the video track.'); return; }
    const candidate = { ...current, start: Math.max(0, finite(start)), track: target };
    if (hasTrackOverlap(clipsRef.current, candidate)) { setError('That position overlaps another clip on this track. Choose a free space.'); return; }
    const next = clipsRef.current.map(c => c.id === clipId ? candidate : c); clipsRef.current = next; setClips(next);
  }, []);
  const updateClip = useCallback((clipId: string, changes: Partial<Pick<TimelineClip, 'start' | 'trimStart' | 'duration' | 'volume' | 'muted'>>) => {
    if (!ready.current) return; const current = clipsRef.current.find(c => c.id === clipId); if (!current) return;
    const asset = assetsRef.current.find(a => a.id === current.assetId); const source = asset?.duration ?? current.duration + current.trimStart; const trimStart = Math.min(Math.max(0, finite(changes.trimStart ?? current.trimStart)), Math.max(0, source - .05)); const max = source - trimStart;
    const candidate = { ...current, ...changes, start: Math.max(0, finite(changes.start ?? current.start)), trimStart, duration: Math.min(max, Math.max(.05, finite(changes.duration ?? current.duration))), volume: Math.min(1, Math.max(0, finite(changes.volume ?? current.volume))) };
    if (hasTrackOverlap(clipsRef.current, candidate)) { setError('That edit overlaps another clip on this track. Choose a free space.'); return; }
    const next = clipsRef.current.map(c => c.id === clipId ? candidate : c); clipsRef.current = next; setClips(next);
  }, []);
  const removeClip = useCallback((clipId: string) => { if (!ready.current) return; setClips(old => old.filter(c => c.id !== clipId)); if (selectedClipId === clipId) setSelectedClipId(null); }, [selectedClipId]);
  const removeAsset = useCallback((assetId: string) => {
    if (!ready.current) return;
    const asset = assetsRef.current.find(a => a.id === assetId); setAssets(old => old.filter(a => a.id !== assetId)); setClips(old => old.filter(c => c.assetId !== assetId));
    if (selectedAssetId === assetId) { selectedRef.current = null; pauseReset(); } if (asset?.src.startsWith('blob:')) { URL.revokeObjectURL(asset.src); urls.current.delete(asset.src); }
  }, [pauseReset, selectedAssetId]);

  const importFiles = useCallback(async (input: FileList | File[]) => {
    if (!ready.current) { setError('Wait for the project to finish loading before importing.'); return; }
    if (native) { setError('Use the desktop Import picker to add media in the native app.'); return; }
    const files = Array.from(input); importChain.current = importChain.current.then(async () => {
      setImporting(true); setError(null);
      for (const file of files) {
        const kind = fileKind(file.name, file.type); if (!kind) { setError(`Unsupported file: ${file.name}`); continue; }
        const assetId = id(), src = URL.createObjectURL(file); urls.current.add(src);
        try { const meta = await probe(src, kind); await blobPut(assetId, file); const asset = { id: assetId, name: file.name, kind, src, size: file.size, ...meta }; setAssets(old => [...old, asset]); if (!selectedRef.current) { selectedRef.current = assetId; modeRef.current = 'source'; setSelectedAssetId(assetId); setSelectedClipId(null); setModeState('source'); setCurrentTime(0); } }
        catch (e) { URL.revokeObjectURL(src); urls.current.delete(src); setError(`${file.name}: ${(e as Error).message}`); }
      } setImporting(false);
    }); return importChain.current;
  }, []);
  const importNative = useCallback(async () => {
    if (!ready.current) { setError('Wait for the project to finish loading before importing.'); return; }
    if (!native || !tauri()) { setError('Native file import is only available in the desktop app.'); return; }
    setImporting(true); setError(null);
    try {
      const files = await tauri()!.invoke<NativeMediaFile[]>('import_media');
      for (const file of files) { const kind = fileKind(file.name); if (!kind) { setError(`Unsupported file: ${file.name}`); continue; } const src = nativeWindow().__TAURI__?.core?.convertFileSrc?.(file.path) ?? ''; if (!src) { setError(`${file.name}: native media URL could not be created.`); continue; } try { const meta = await probe(src, kind); const assetId = id(); setAssets(old => [...old, { id: assetId, name: file.name, kind, src, nativePath: file.path, size: file.size, ...meta }]); if (!selectedRef.current) { selectedRef.current = assetId; modeRef.current = 'source'; setSelectedAssetId(assetId); setSelectedClipId(null); setModeState('source'); setCurrentTime(0); } } catch (e) { setError(`${file.name}: ${(e as Error).message}`); } }
    } catch (e) { setError(`Could not import media: ${(e as Error).message}`); }
    finally { setImporting(false); }
  }, [native]);
  const newProject = useCallback(() => { ready.current = true; pauseReset(); assetsRef.current.forEach(a => { if (a.src.startsWith('blob:')) { URL.revokeObjectURL(a.src); urls.current.delete(a.src); } }); assetsRef.current = []; clipsRef.current = []; selectedRef.current = null; modeRef.current = 'source'; setProjectName('Untitled project'); setAssets([]); setClips([]); setSelectedAssetId(null); setSelectedClipId(null); setTrackMuted({ video: false, audio: false }); setModeState('source'); setSaveStatus('saving'); setError(null); }, [pauseReset]);
  const exportProject = useCallback(() => { const data: StoredProject = { projectName, assets: assets.map(({ src, ...a }) => a), clips, trackMuted }; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); a.download = `${projectName || 'project'}.nour.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 0); }, [projectName, assets, clips, trackMuted]);

  return { projectName, setProjectName: name => { if (ready.current) setProjectName(name); }, assets, clips, selectedAssetId, selectedClipId, selectAsset, selectClip, mode, setMode, currentTime, seek, playing, togglePlay: () => { if (!ready.current) return; if (!playbackDuration) { reportError('Select supported media or add a clip before playing.'); return; } if (currentTime >= playbackDuration) setCurrentTime(0); setPlaying(p => !p); }, playbackReady, buffering, setPlaybackReady, syncPlaybackTime, duration, playbackDuration, volume, setVolume: v => setVolume(Math.min(1, Math.max(0, v))), muted, setMuted, trackMuted, toggleTrackMute: track => setTrackMuted(m => ({ ...m, [track]: !m[track] })), addToTimeline, moveClip, updateClip, removeClip, removeAsset, importFiles, importNative, importing, isNative: native, error, reportError, clearError: () => setError(null), saveStatus, newProject, exportProject };
}