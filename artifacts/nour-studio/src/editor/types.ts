export type MediaKind = 'video' | 'audio' | 'image';
export type Track = 'video' | 'audio';
export type ProjectType = 'documentary' | 'wedding' | 'interview' | 'social' | 'custom';
export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3';
export type ProjectSettings = {
  type: ProjectType;
  aspectRatio: AspectRatio;
  resolution: '3840x2160' | '1920x1080' | '1080x1920' | '1080x1080' | '1280x720';
  frameRate: 24 | 25 | 30 | 60;
};
export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  type: 'custom',
  aspectRatio: '16:9',
  resolution: '1920x1080',
  frameRate: 30,
};
export type Adjustments = {
  exposure: number;
  contrast: number;
  saturation: number;
};
export type MediaAsset = {
  id: string;
  name: string;
  kind: MediaKind;
  src: string;
  duration: number;
  width?: number;
  height?: number;
  size?: number;
  nativePath?: string;
  demo?: boolean;
  error?: string;
  adjustments?: Adjustments;
};
export type TimelineClip = {
  id: string;
  assetId: string;
  track: Track;
  start: number;
  trimStart: number;
  duration: number;
  volume: number;
  muted: boolean;
};
export type NativeMediaFile = { path: string; name: string; size: number };
export type EditorController = {
  projectName: string;
  setProjectName: (name: string) => void;
  projectSettings: ProjectSettings;
  hasProject: boolean;
  createProject: (name: string, settings: ProjectSettings) => void;
  createSampleProject: (settings: ProjectSettings) => void;
  assets: MediaAsset[];
  clips: TimelineClip[];
  selectedAssetId: string | null;
  selectedClipId: string | null;
  selectAsset: (id: string) => void;
  selectClip: (id: string) => void;
  mode: 'source' | 'timeline';
  setMode: (mode: 'source' | 'timeline') => void;
  currentTime: number;
  seek: (seconds: number) => void;
  previewSeek: (seconds: number) => void;
  commitSeek: (seconds: number) => void;
  playing: boolean;
  togglePlay: () => void;
  playbackReady: boolean;
  buffering: boolean;
  setPlaybackReady: (ready: boolean) => void;
  setMediaClockActive: (active: boolean) => void;
  syncPlaybackTime: (seconds: number) => void;
  seekRevision: number;
  duration: number;
  playbackDuration: number;
  volume: number;
  setVolume: (volume: number) => void;
  muted: boolean;
  setMuted: (muted: boolean) => void;
  trackMuted: Record<Track, boolean>;
  toggleTrackMute: (track: Track) => void;
  addToTimeline: (assetId: string, start?: number, track?: Track) => void;
  moveClip: (clipId: string, start: number, track?: Track) => void;
  updateClip: (clipId: string, changes: Partial<Pick<TimelineClip, 'start' | 'trimStart' | 'duration' | 'volume' | 'muted'>>) => void;
  removeClip: (clipId: string) => void;
  removeAsset: (assetId: string) => void;
  updateAssetAdjustments: (assetId: string, adjustments: Partial<Adjustments>) => void;
  resetAssetAdjustments: (assetId: string) => void;
  importFiles: (files: FileList | File[]) => Promise<void>;
  importNative: () => Promise<void>;
  importing: boolean;
  isNative: boolean;
  error: string | null;
  reportError: (message: string) => void;
  clearError: () => void;
  saveStatus: 'loading' | 'saving' | 'saved' | 'error';
  exportProject: () => void;
};

export function formatTime(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const whole = Math.floor(safe);
  return `${Math.floor(whole / 60).toString().padStart(2, '0')}:${(whole % 60).toString().padStart(2, '0')}.${Math.floor((safe % 1) * 10)}`;
}