import { useEffect, useMemo, useState } from 'react';
import { Link, Route, Router as WouterRouter, Switch } from 'wouter';
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  AudioLines,
  BarChart3,
  Bell,
  Captions,
  ChevronDown,
  CircleHelp,
  Clapperboard,
  CloudOff,
  Download,
  FileAudio,
  FileVideo,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Layers3,
  LayoutDashboard,
  ListFilter,
  LockKeyhole,
  Mail,
  Maximize2,
  MoreHorizontal,
  MoveRight,
  Palette,
  Pause,
  Pencil,
  Play,
  Plus,
  Redo2,
  RefreshCw,
  Rocket,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  StepBack,
  StepForward,
  Undo2,
  Upload,
  Users,
  Volume2,
  X,
} from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

type View = 'media' | 'story' | 'edit' | 'color' | 'audio' | 'captions' | 'motion' | 'generate' | 'export';
type AssetTag = 'aroll' | 'broll' | 'audio' | 'image';
type Asset = { id: string; name: string; type: 'video' | 'audio' | 'image'; duration: string; camera: string; tag: AssetTag; src?: string };
type Clip = { id: string; name: string; lane: 'picture' | 'broll' | 'dialogue'; left: number; width: number; color: 'blue' | 'violet' | 'amber' };
type ColorState = { temperature: number; tint: number; exposure: number; contrast: number; highlights: number; shadows: number; saturation: number };
type ReferenceMode = 'upload' | 'link' | 'style' | 'none';
type BrandKitState = { logo: string; fonts: string; colors: string; captionStyle: string };
type DesktopInfo = { platform: string; dataDirectory: string };

declare global {
  interface Window {
    __TAURI__?: {
      core?: {
        invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
      };
    };
  }
}

const seededAssets: Asset[] = [
  { id: 'a1', name: 'market-dawn.mov', type: 'video', duration: '00:42', camera: 'Sony FX3', tag: 'broll' },
  { id: 'a2', name: 'interview-take-03.mov', type: 'video', duration: '08:17', camera: 'Apple Log', tag: 'aroll' },
  { id: 'a3', name: 'hands-at-work.mov', type: 'video', duration: '01:08', camera: 'Canon C70', tag: 'broll' },
  { id: 'a4', name: 'room-tone.wav', type: 'audio', duration: '03:14', camera: 'Zoom F3', tag: 'audio' },
];
const seededClips: Clip[] = [
  { id: 'c1', name: 'interview-take-03', lane: 'picture', left: 2, width: 35, color: 'blue' },
  { id: 'c2', name: 'market-dawn', lane: 'broll', left: 39, width: 17, color: 'violet' },
  { id: 'c3', name: 'hands-at-work', lane: 'broll', left: 60, width: 20, color: 'violet' },
  { id: 'c4', name: 'interview-take-03.wav', lane: 'dialogue', left: 2, width: 57, color: 'amber' },
];

const viewMeta: Record<View, [string, string]> = {
  media: ['Media library', 'Organize your story'],
  story: ['Story engine', 'Shape the narrative'],
  edit: ['Edit', 'Build the rough cut'],
  color: ['Color', 'Normalize and grade'],
  audio: ['Audio', 'Clean the voice'],
  captions: ['Captions', 'Make every word readable'],
  motion: ['Motion', 'Titles, thumbnails and animation'],
  generate: ['Generate', 'Create missing visuals'],
  export: ['Export', 'Finish the film'],
};

function NourMark() {
  return <div className="nour-mark" aria-label="Nour mark"><span /><span /><span /></div>;
}

function useLocalToast() {
  const [message, setMessage] = useState('');
  const notify = (next: string) => {
    setMessage(next);
    window.setTimeout(() => setMessage(''), 2400);
  };
  return { message, notify };
}

function EditorPage() {
  const [view, setView] = useState<View>('media');
  const [projectName, setProjectName] = useState('Untitled film');
  const [projectType, setProjectType] = useState('Documentary');
  const [camera, setCamera] = useState('Auto-detect media');
  const [assets, setAssets] = useState<Asset[]>(seededAssets);
  const [clips, setClips] = useState<Clip[]>(seededClips);
  const [selectedAssetId, setSelectedAssetId] = useState('a2');
  const [selectedClipId, setSelectedClipId] = useState('c1');
  const [inspectorTab, setInspectorTab] = useState<'basic' | 'advanced'>('basic');
  const [playing, setPlaying] = useState(false);
  const [scrub, setScrub] = useState(18);
  const [title, setTitle] = useState('');
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectNameError, setNewProjectNameError] = useState(false);
  const [creativeBrief, setCreativeBrief] = useState('');
  const [referenceMode, setReferenceMode] = useState<ReferenceMode>('none');
  const [referenceFileName, setReferenceFileName] = useState('');
  const [referenceLink, setReferenceLink] = useState('');
  const [styleDNA, setStyleDNA] = useState('No saved Style DNA');
  const [brandKit, setBrandKit] = useState<BrandKitState>({ logo: '', fonts: '', colors: 'No color palette', captionStyle: 'Default captions' });
  const [desktopInfo, setDesktopInfo] = useState<DesktopInfo | null>(null);
  const [apiOnline, setApiOnline] = useState(false);
  const [color, setColor] = useState<ColorState>({ temperature: 5600, tint: 0, exposure: 4, contrast: 8, highlights: -6, shadows: 5, saturation: 0 });
  const [audio, setAudio] = useState({ volume: 100, denoise: false, voice: false });
  const { message, notify } = useLocalToast();
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId);
  const selectedClip = clips.find((clip) => clip.id === selectedClipId);
  const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

  useEffect(() => {
    const invoke = window.__TAURI__?.core?.invoke;
    if (invoke) {
      void invoke<DesktopInfo>('desktop_info')
        .then((info) => {
          setDesktopInfo(info);
          if (!apiBaseUrl) setApiOnline(true);
        })
        .catch(() => setDesktopInfo(null));
    }
    if (!apiBaseUrl) return;
    void fetch(`${apiBaseUrl}/api/healthz`)
      .then((response) => setApiOnline(response.ok))
      .catch(() => setApiOnline(false));
  }, [apiBaseUrl]);

  const chooseAsset = (asset: Asset) => {
    setSelectedAssetId(asset.id);
    setSelectedClipId('');
    notify(`${asset.name} selected`);
  };
  const addToTimeline = (asset: Asset) => {
    const clip: Clip = {
      id: `clip-${Date.now()}`,
      name: asset.name.replace(/\.[^.]+$/, ''),
      lane: asset.type === 'audio' ? 'dialogue' : asset.tag === 'broll' ? 'broll' : 'picture',
      left: Math.min(78, 4 + clips.length * 14),
      width: asset.type === 'audio' ? 30 : 16,
      color: asset.type === 'audio' ? 'amber' : asset.tag === 'broll' ? 'violet' : 'blue',
    };
    setClips((items) => [...items, clip]);
    setSelectedClipId(clip.id);
    setSelectedAssetId(asset.id);
    notify(`${asset.name} added to timeline`);
  };
  const importFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const additions = Array.from(files).map((file, index): Asset => ({
      id: `import-${Date.now()}-${index}`,
      name: file.name,
      type: file.type.startsWith('audio') ? 'audio' : file.type.startsWith('image') ? 'image' : 'video',
      duration: file.type.startsWith('image') ? 'still' : '00:30',
      camera: camera === 'Auto-detect media' ? 'Imported media' : camera,
      tag: file.type.startsWith('audio') ? 'audio' : file.type.startsWith('image') ? 'image' : 'broll',
      src: URL.createObjectURL(file),
    }));
    setAssets((items) => [...items, ...additions]);
    setSelectedAssetId(additions[0].id);
    setSelectedClipId('');
    notify(`${additions.length} ${additions.length === 1 ? 'file' : 'files'} imported — preview ready`);
  };
  const addTitle = () => {
    setTitle('Your title');
    notify('Editable title added to the timeline');
  };
  const exportProject = async () => {
    const data = JSON.stringify({ projectName, creativeBrief, reference: { mode: referenceMode, fileName: referenceFileName, link: referenceLink, styleDNA }, brandKit, projectType, camera, assets, clips, color, audio }, null, 2);
    const invoke = window.__TAURI__?.core?.invoke;
    if (invoke) {
      try {
        const savedPath = await invoke<string>('save_project', { projectName, contents: data });
        notify(`Project saved locally · ${savedPath}`);
      } catch {
        notify('Nour could not save the desktop project');
      }
      return;
    }
    const blob = new Blob([data], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${projectName.toLowerCase().replace(/\s+/g, '-') || 'nour-project'}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    notify('Project description exported locally');
  };
  const startNewProject = () => {
    setNewProjectName('');
    setNewProjectNameError(false);
    setCreativeBrief('');
    setReferenceMode('none');
    setReferenceFileName('');
    setReferenceLink('');
    setStyleDNA('No saved Style DNA');
    setBrandKit({ logo: '', fonts: '', colors: 'No color palette', captionStyle: 'Default captions' });
    setNewProjectOpen(true);
  };
  const confirmNewProject = () => {
    const trimmedName = newProjectName.trim();
    if (!trimmedName) {
      setNewProjectNameError(true);
      notify('Project name is required');
      return;
    }
    setView('media');
    setProjectName(trimmedName);
    setProjectType('Documentary');
    setCamera('Auto-detect media');
    setAssets([]);
    setClips([]);
    setSelectedAssetId('');
    setSelectedClipId('');
    setInspectorTab('basic');
    setPlaying(false);
    setScrub(0);
    setTitle('');
    setColor({ temperature: 5600, tint: 0, exposure: 4, contrast: 8, highlights: -6, shadows: 5, saturation: 0 });
    setAudio({ volume: 100, denoise: false, voice: false });
    setNewProjectOpen(false);
    notify(`${trimmedName} created locally`);
  };

  const navItems: Array<[View, string, typeof Film]> = [
    ['media', 'Media', FolderOpen],
    ['story', 'Story', Layers3],
    ['edit', 'Edit', Film],
    ['color', 'Color', Palette],
    ['audio', 'Audio', AudioLines],
    ['captions', 'Captions', Captions],
    ['motion', 'Motion', Sparkles],
    ['generate', 'Generate', Clapperboard],
  ];
  const [contextLabel, contextTitle] = viewMeta[view];

  return (
    <div className="desktop-app">
      <header className="desktop-topbar">
        <Link href="/" className="brand-lockup" data-testid="link-nour-home"><NourMark /><div><div className="brand-name">NOUR</div><span className="brand-sub">local video studio</span></div></Link>
        <div className="project-lockup">
          <span className="status-dot" />
          <input className="project-input" value={projectName} onChange={(event) => setProjectName(event.target.value)} aria-label="Project name" data-testid="input-project-name" />
          <button className="icon-btn" onClick={() => notify('Project name is ready to edit')} title="Rename project" data-testid="button-rename-project"><Pencil size={13} /></button>
          <span className="save-note">Saved locally</span>
        </div>
        <div className="top-actions">
          <button className="ghost-btn" onClick={() => notify('Undo is ready for the next local edit')} title="Undo" data-testid="button-undo"><Undo2 size={15} /></button>
          <button className="ghost-btn" onClick={() => notify('Redo is ready for the next local edit')} title="Redo" data-testid="button-redo"><Redo2 size={15} /></button>
          <span className="hairline" />
          <span className={`local-badge ${desktopInfo ? 'desktop-live' : ''}`} title={desktopInfo ? `Project data: ${desktopInfo.dataDirectory}` : 'Use the native app for full local testing'}><LockKeyhole size={11} /> {desktopInfo ? 'Desktop live' : 'Browser preview'}</span>
          <span className={`api-badge ${apiOnline ? 'online' : ''}`} title={desktopInfo ? 'Nour local runtime is ready' : apiOnline ? 'Nour API is connected' : 'Nour API is offline'}><span /> {desktopInfo ? 'Local' : 'API'}</span>
          <button className="new-project-btn" onClick={startNewProject} data-testid="button-new-project"><Plus size={12} /><span>New project</span></button>
          <Link href="/console/" className="console-link" data-testid="link-open-console"><ArrowUpRight size={12} /><span>Open Console</span></Link>
          <button className="outline-btn" onClick={exportProject} data-testid="button-export-project">Export project</button>
          <button className="primary-btn" onClick={() => notify('Local render queue is ready for the media engine')} data-testid="button-export-video">Export video</button>
        </div>
      </header>
      {!window.__TAURI__ && <section className="mac-download-banner" aria-label="Download Nour for Mac">
        <div className="mac-download-copy"><strong>Get Nour for Mac <span>v0.1.0</span></strong><p>Download the DMG, open it, then drag Nour into Applications. macOS 12 or later.</p></div>
        <div className="mac-download-links">
          <a href="https://github.com/mahdichafik-ship-it/nour/releases/download/v0.1.0/Nour-0.1.0-arm64.dmg" data-testid="download-mac-arm64"><Download size={15} /> Apple Silicon <span>M-series</span></a>
          <a href="https://github.com/mahdichafik-ship-it/nour/releases/download/v0.1.0/Nour-0.1.0-x64.dmg" data-testid="download-mac-x64"><Download size={15} /> Intel Mac</a>
        </div>
        <p className="mac-download-help">Not sure? Apple menu → About This Mac → Chip or Processor.</p>
      </section>}
      <div className="desktop-body">
        <aside className="editor-sidebar">
          <nav className="editor-nav" aria-label="Editor navigation">
            {navItems.map(([key, label, Icon]) => (
              <button key={key} className={view === key ? 'active' : ''} onClick={() => setView(key)} data-testid={`nav-editor-${key}`}><Icon size={15} /><span>{label}</span>{key === 'media' && <span className="nav-count">{assets.length}</span>}</button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <button className={view === 'export' ? 'active' : ''} onClick={() => setView('export')} data-testid="nav-editor-export"><MoveRight size={15} /><span>Export</span></button>
            <div className="sidebar-rule" />
            <div className="storage-card"><CloudOff size={16} /><div><strong>Local project</strong><span>No cloud uploads</span></div><span className="status-dot" /></div>
            <button className="prefs-btn" onClick={() => notify('Preferences surface is ready')} data-testid="button-preferences"><Settings size={14} /><span>Preferences</span></button>
          </div>
        </aside>
        <main className="main-editor">
          <section className="context-bar">
            <div className="breadcrumb"><span>{contextLabel}</span><b>/</b><strong>{contextTitle}</strong></div>
            <div className="context-controls">
              <label className="field-chip">Project <select value={projectType} onChange={(event) => { setProjectType(event.target.value); notify(`${event.target.value} preset selected`); }} data-testid="select-project-type"><option>Documentary</option><option>Interview</option><option>Podcast</option><option>Wedding film</option><option>Commercial</option><option>Travel film</option><option>Social short</option></select></label>
              <label className="field-chip">Camera profile <select value={camera} onChange={(event) => setCamera(event.target.value)} data-testid="select-camera-profile"><option>Auto-detect media</option><option>Apple Log / ProRes</option><option>Sony S-Log3</option><option>Canon C-Log3</option><option>Blackmagic Film</option><option>Rec.709</option></select></label>
            </div>
          </section>
          <section className="editor-grid">
            <div className="center-editor">
              <div className="viewer-card">
                <div className="viewer-toolbar">
                  <div className="viewer-mode"><button className="mode-btn active" onClick={() => notify('Viewer mode active')} data-testid="button-viewer-mode">Viewer</button><button className="mode-btn" onClick={() => notify('Scopes will open in the color engine')} data-testid="button-scopes-mode">Scopes</button></div>
                  <div className="viewer-tools"><span className="viewer-info">{selectedAsset ? `${selectedAsset.name} · ${selectedAsset.camera}` : 'No media selected'}</span><button className="icon-btn" onClick={() => notify('Capture a frame after pausing on a clip')} title="Capture thumbnail" data-testid="button-capture-thumbnail"><ImageIcon size={14} /></button><button className="icon-btn" onClick={() => notify('Fullscreen preview is ready')} title="Fullscreen" data-testid="button-fullscreen"><Maximize2 size={14} /></button></div>
                </div>
                <div className="viewer-stage">
                  <div className="viewer-art" style={{ filter: `brightness(${100 + color.exposure * .55}%) contrast(${100 + color.contrast * .55}%) saturate(${100 + color.saturation * .55}%)` }} />
                  {selectedAsset?.src && selectedAsset.type === 'video' && <video className="viewer-media" src={selectedAsset.src} autoPlay muted loop playsInline controls aria-label={`Preview of ${selectedAsset.name}`} style={{ filter: `brightness(${100 + color.exposure * .55}%) contrast(${100 + color.contrast * .55}%) saturate(${100 + color.saturation * .55}%)` }} data-testid="video-local-preview" />}
                  {selectedAsset?.src && selectedAsset.type === 'image' && <img className="viewer-media" src={selectedAsset.src} alt={`Preview of ${selectedAsset.name}`} style={{ filter: `brightness(${100 + color.exposure * .55}%) contrast(${100 + color.contrast * .55}%) saturate(${100 + color.saturation * .55}%)` }} data-testid="image-local-preview" />}
                  {selectedAsset?.type === 'audio' && <div className="viewer-empty"><div className="play-orb"><AudioLines size={14} /></div><strong>Audio file selected</strong><span>Add it to the timeline to hear it with your edit.</span></div>}
                  {!selectedAsset && <div className="viewer-empty"><div className="play-orb"><Play size={14} fill="currentColor" /></div><strong>Drop your first clip here</strong><span>Everything stays on this computer.</span></div>}
                  {title && <div className="overlay-title">{title}</div>}
                  <div className="viewer-vignette" />
                </div>
                <div className="transport">
                  <button onClick={() => setScrub((value) => Math.max(0, value - 2))} title="Step back" data-testid="button-step-back"><StepBack size={14} /></button>
                  <button className="play-transport" onClick={() => setPlaying((value) => !value)} data-testid="button-play">{playing ? <Pause size={11} fill="currentColor" /> : <Play size={11} fill="currentColor" />}</button>
                  <button onClick={() => setScrub((value) => Math.min(100, value + 2))} title="Step forward" data-testid="button-step-forward"><StepForward size={14} /></button>
                  <span className="timecode">00:00:{String(Math.floor(scrub / 2)).padStart(2, '0')}:12</span>
                  <input className="scrubber" type="range" min="0" max="100" value={scrub} onChange={(event) => setScrub(Number(event.target.value))} aria-label="Timeline scrubber" data-testid="input-scrubber" />
                  <span className="duration">{selectedAsset?.duration || '00:00'}</span>
                  <button onClick={() => notify('Audio monitoring toggled')} title="Mute" data-testid="button-mute"><Volume2 size={14} /></button>
                  <label className="zoom">Fit <select aria-label="Viewer zoom" data-testid="select-viewer-zoom"><option>Fit</option><option>100%</option><option>75%</option><option>50%</option></select></label>
                </div>
              </div>
              <section className="workspace-panel">
                <div className="panel-heading"><div><p className="eyebrow">{contextLabel.toUpperCase()}</p><h2>{contextTitle}</h2></div><div className="panel-actions">{view === 'media' && <><button className="outline-btn" onClick={() => notify('A new bin is ready to name')} data-testid="button-new-bin"><Plus size={13} /> New bin</button><label className="primary-btn"><Upload size={13} /> Import media<input type="file" hidden multiple accept="video/*,audio/*,image/*" onChange={(event) => importFiles(event.target.files)} data-testid="input-import-media" /></label></>}</div></div>
                <div className="panel-content">{renderEditorPanel(view, assets, selectedAssetId, chooseAsset, addToTimeline, setView, setTitle, title, notify)}</div>
              </section>
            </div>
            <aside className="inspector">
              <div className="inspector-head"><div><p className="eyebrow">INSPECTOR</p><h3>{selectedAsset?.name || selectedClip?.name || 'Nothing selected'}</h3></div><button className="icon-btn" onClick={() => notify('Inspector options opened')} data-testid="button-inspector-menu"><MoreHorizontal size={15} /></button></div>
              <div className="inspector-tabs"><button className={inspectorTab === 'basic' ? 'active' : ''} onClick={() => setInspectorTab('basic')} data-testid="tab-inspector-basic">Basic</button><button className={inspectorTab === 'advanced' ? 'active' : ''} onClick={() => { setInspectorTab('advanced'); notify('Advanced curves and HSL are next in the color engine'); }} data-testid="tab-inspector-advanced">Advanced</button></div>
              <div className="inspector-content">{selectedAsset || selectedClip ? <InspectorControls color={color} setColor={setColor} audio={audio} setAudio={setAudio} notify={notify} advanced={inspectorTab === 'advanced'} /> : <div className="inspector-empty"><div className="inspector-empty-icon"><SlidersHorizontal size={15} /></div><strong>Select a clip to edit</strong><span>Color, audio, masks and titles will appear here.</span></div>}</div>
            </aside>
          </section>
          <Timeline clips={clips} selectedClipId={selectedClipId} setSelectedClipId={(id) => { setSelectedClipId(id); const clip = clips.find((item) => item.id === id); if (clip) notify(`${clip.name} selected`); }} addTitle={addTitle} addMarker={() => notify('Marker placed at current playhead')} addThumb={() => notify('Pause on a frame to capture a thumbnail')} title={title} />
        </main>
      </div>
      {newProjectOpen && (
        <div className="project-modal-backdrop" onClick={() => setNewProjectOpen(false)} role="presentation">
          <form className="project-modal project-create-modal" role="dialog" aria-modal="true" aria-labelledby="new-project-title" onSubmit={(event) => { event.preventDefault(); confirmNewProject(); }} onClick={(event) => event.stopPropagation()}>
            <button type="button" className="project-modal-close" onClick={() => setNewProjectOpen(false)} aria-label="Close new project window" data-testid="button-close-new-project"><X size={15} /></button>
            <p className="eyebrow">NEW LOCAL PROJECT</p>
            <h2 id="new-project-title">Create Project</h2>
            <p>Start with a clear intention. Your footage and project stay on this computer.</p>

            <div className="project-form-section">
              <label className="project-field-label" htmlFor="new-project-name">Project Name <span>Required</span></label>
              <input id="new-project-name" className={`project-text-input ${newProjectNameError ? 'has-error' : ''}`} value={newProjectName} onChange={(event) => { setNewProjectName(event.target.value); setNewProjectNameError(false); }} placeholder="e.g. Morocco, in motion" autoFocus required data-testid="input-new-project-name" />
              {newProjectNameError && <span className="project-field-error">Give your project a name to continue.</span>}
            </div>

            <div className="project-form-section">
              <label className="project-field-label" htmlFor="creative-brief">Creative Brief <span>Optional</span></label>
              <label className="project-field-hint" htmlFor="creative-brief">What are you trying to create?</label>
              <textarea id="creative-brief" className="project-textarea" value={creativeBrief} onChange={(event) => setCreativeBrief(event.target.value)} placeholder="Create a cinematic film about this trip. Emotional but energetic, use the interviews to tell the story and use B-roll to support what they're talking about." data-testid="input-creative-brief" />
            </div>

            <div className="project-form-section">
              <div className="project-field-label">Reference / Inspiration <span>Optional</span></div>
              <div className="reference-options" role="radiogroup" aria-label="Reference or inspiration">
                {([['upload', 'Upload reference video'], ['link', 'Paste public link'], ['style', 'Choose saved Style DNA'], ['none', 'No reference']] as Array<[ReferenceMode, string]>).map(([mode, label]) => <button type="button" key={mode} className={`reference-option ${referenceMode === mode ? 'selected' : ''}`} onClick={() => setReferenceMode(mode)} role="radio" aria-checked={referenceMode === mode} data-testid={`button-reference-${mode}`}>{label}</button>)}
              </div>
              {referenceMode === 'upload' && <label className="project-upload-row"><Upload size={14} /><span>{referenceFileName || 'Choose a reference video from this computer'}</span><input type="file" hidden accept="video/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) { setReferenceFileName(file.name); notify('Reference video selected locally'); } }} data-testid="input-reference-video" /></label>}
              {referenceMode === 'link' && <input className="project-text-input" type="url" value={referenceLink} onChange={(event) => setReferenceLink(event.target.value)} placeholder="https://vimeo.com/... or another supported public link" data-testid="input-reference-link" />}
              {referenceMode === 'style' && <select className="project-select" value={styleDNA} onChange={(event) => setStyleDNA(event.target.value)} data-testid="select-style-dna"><option>No saved Style DNA</option><option>Warm documentary</option><option>Editorial interview</option><option>Noir travel diary</option><option>Bright social story</option></select>}
            </div>

            <div className="project-form-section">
              <div className="project-field-label">Brand Kit <span>Optional</span></div>
              <div className="brand-kit-grid">
                <label className="brand-kit-upload"><strong>Logo</strong><span>{brandKit.logo || 'Upload logo'}</span><input type="file" hidden accept="image/*,.svg" onChange={(event) => { const file = event.target.files?.[0]; if (file) setBrandKit({ ...brandKit, logo: file.name }); }} data-testid="input-brand-logo" /></label>
                <label className="brand-kit-upload"><strong>Fonts</strong><span>{brandKit.fonts || 'Upload fonts'}</span><input type="file" hidden accept=".otf,.ttf,.woff,.woff2" multiple onChange={(event) => { const files = Array.from(event.target.files || []); if (files.length) setBrandKit({ ...brandKit, fonts: files.map((file) => file.name).join(', ') }); }} data-testid="input-brand-fonts" /></label>
                <label className="brand-kit-select"><strong>Colors</strong><select value={brandKit.colors} onChange={(event) => setBrandKit({ ...brandKit, colors: event.target.value })} data-testid="select-brand-colors"><option>No color palette</option><option>Nour warm neutral</option><option>Midnight and gold</option><option>Custom palette</option></select></label>
                <label className="brand-kit-select"><strong>Caption style</strong><select value={brandKit.captionStyle} onChange={(event) => setBrandKit({ ...brandKit, captionStyle: event.target.value })} data-testid="select-caption-style"><option>Default captions</option><option>Clean lower third</option><option>Bold social captions</option><option>Arabic-first captions</option></select></label>
              </div>
            </div>

            <div className="project-modal-actions">
              <button type="button" className="outline-btn" onClick={() => setNewProjectOpen(false)} data-testid="button-cancel-new-project">Keep editing</button>
              <button className="primary-btn" type="submit" data-testid="button-confirm-new-project">Create project <b>→</b></button>
            </div>
          </form>
        </div>
      )}
      {message && <div className="toast show" role="status" data-testid="status-editor-toast">{message}</div>}
    </div>
  );
}

function renderEditorPanel(view: View, assets: Asset[], selectedAssetId: string, chooseAsset: (asset: Asset) => void, addToTimeline: (asset: Asset) => void, setView: (view: View) => void, setTitle: (title: string) => void, title: string, notify: (message: string) => void) {
  if (view === 'media') return assets.length ? <div className="media-grid">{assets.map((asset) => <article className={`media-card ${asset.id === selectedAssetId ? 'selected' : ''}`} key={asset.id} onClick={() => chooseAsset(asset)} data-testid={`card-media-${asset.id}`}><div className="media-thumb">{asset.src && asset.type === 'image' ? <img src={asset.src} alt="" /> : asset.src && asset.type === 'video' ? <video src={asset.src} muted playsInline preload="metadata" /> : asset.type === 'audio' ? <FileAudio size={22} /> : asset.type === 'image' ? <ImageIcon size={22} /> : <FileVideo size={22} />}<span className="media-kind">{asset.type.toUpperCase()}</span></div><div className="media-meta"><span className="media-name">{asset.name}</span><div className="media-details"><span>{asset.duration}</span><span>{asset.camera}</span></div><div className="media-tags"><button className={`tag-btn ${asset.tag === 'aroll' ? 'selected-a' : ''}`} onClick={(event) => { event.stopPropagation(); notify(`${asset.name} tagged A-roll`); }} data-testid={`button-tag-aroll-${asset.id}`}>A-roll</button><button className={`tag-btn ${asset.tag === 'broll' ? 'selected-b' : ''}`} onClick={(event) => { event.stopPropagation(); notify(`${asset.name} tagged B-roll`); }} data-testid={`button-tag-broll-${asset.id}`}>B-roll</button><button className="tag-btn" onClick={(event) => { event.stopPropagation(); addToTimeline(asset); }} data-testid={`button-add-timeline-${asset.id}`}><Plus size={10} /></button></div></div></article>)}</div> : <div className="media-empty" data-testid="empty-media-library"><div className="media-empty-icon"><Upload size={20} /></div><strong>No media in this project</strong><span>Import A-roll, B-roll, audio, or images to begin.</span></div>;
  const cards: Record<Exclude<View, 'media'>, Array<[string, string]>> = {
    story: [['1 · Understand', 'Transcribe dialogue, detect speakers, pauses, takes, and story beats.'], ['2 · Match', 'Find visual coverage for each sentence from A-roll and B-roll.'], ['3 · Shape', 'Choose a narrative structure and keep every decision editable.']],
    edit: [['Editable rough cut', 'Place A-roll and B-roll on separate tracks. Nothing is baked into source files.'], ['Project type', 'Presets can guide pacing, captions, and transitions without locking the edit.'], ['Next step', 'Tag clips, then use plus to place them on the timeline.']],
    color: [['Basic grading is ready', 'Use the inspector to adjust exposure, contrast, white balance, Kelvin, tint, and saturation.'], ['Camera normalization', 'The selected camera profile keeps mixed footage consistent.'], ['Non-destructive', 'Every adjustment remains editable and stays with the local project.']],
    audio: [['Dialogue first', 'Audio tracks stay separate so voice, music, and ambience can be mixed independently.'], ['Local processing', 'Volume, fades, and first-pass cleanup controls run on this computer.'], ['Next audio pass', 'Noise reduction, voice enhancement, EQ, and ducking are queued next.']],
    captions: [['Darija-ready workflow', 'Import SRT or VTT later. Arabic and Latin Darija can share the same timeline.'], ['Readable by design', 'RTL layout, safe areas, line breaks, and caption styles will be project presets.'], ['Editable text', 'Transcript edits update caption timing without changing original media.']],
    motion: [['Titles now', 'Add a title from the timeline and edit its text in the inspector.'], ['Keyframes next', 'Position, scale, opacity, masks, and animated captions use the same timeline model.'], ['Thumbnail studio', 'Pause on any frame, capture it, and build a title-ready thumbnail.']],
    generate: [['Local by default', 'No media is uploaded from this preview. External generation is opt-in.'], ['Missing shot ideas', 'A story engine can suggest a B-roll prompt for any uncovered section.'], ['Provider-ready', 'Add video and 3D providers without changing the timeline model.']],
    export: [['Local export', 'Choose a master, social format, or project package. Export stays on this computer.'], ['Thumbnail output', 'Captured frames can be exported as JPG or PNG in the thumbnail studio.'], ['Project archive', 'Export a portable JSON project description with local media references.']],
  };
  return <div className="feature-grid">{cards[view].map(([heading, copy]) => <div className="feature-card" key={heading}><strong>{heading}</strong><p>{copy}</p></div>)}</div>;
}

function InspectorControls({ color, setColor, audio, setAudio, notify, advanced }: { color: ColorState; setColor: (value: ColorState) => void; audio: { volume: number; denoise: boolean; voice: boolean }; setAudio: (value: { volume: number; denoise: boolean; voice: boolean }) => void; notify: (message: string) => void; advanced: boolean }) {
  const sliders: Array<[string, string, number, number, string]> = [['temperature', 'Kelvin', 2200, 12000, `${color.temperature}K`], ['tint', 'Tint', -100, 100, `${color.tint}`], ['exposure', 'Exposure', -100, 100, `${color.exposure}`], ['contrast', 'Contrast', -100, 100, `${color.contrast}`], ['highlights', 'Highlights', -100, 100, `${color.highlights}`], ['shadows', 'Shadows', -100, 100, `${color.shadows}`], ['saturation', 'Saturation', -100, 100, `${color.saturation}`]];
  if (advanced) return <div className="inspector-empty"><div className="inspector-empty-icon"><Palette size={15} /></div><strong>Advanced color room</strong><span>Curves, HSL, scopes, and wheels are next in the local color engine.</span></div>;
  return <>
    <div className="inspector-section"><div className="section-title">White balance <span>LIGHTROOM</span></div>{sliders.slice(0, 2).map(([key, label, min, max, output]) => <ControlRow key={key} label={label} value={color[key as keyof ColorState]} min={min} max={max} output={output} onChange={(value) => setColor({ ...color, [key]: value })} />)}<button className="subtle-btn" onClick={() => notify('Eyedropper is ready for the color engine')} data-testid="button-white-balance"><Sparkles size={11} /> Pick neutral white from viewer</button></div>
    <div className="inspector-section"><div className="section-title">Tone</div>{sliders.slice(2).map(([key, label, min, max, output]) => <ControlRow key={key} label={label} value={color[key as keyof ColorState]} min={min} max={max} output={output} onChange={(value) => setColor({ ...color, [key]: value })} />)}</div>
    <div className="inspector-section"><div className="section-title">Quick looks</div><div className="swatch-row">{[['neutral', '#a68e75'], ['warm', '#d39b67'], ['cool', '#718da9'], ['film', '#887a5d']].map(([name, background]) => <button key={name} className="swatch" style={{ background }} onClick={() => { const presets: Record<string, Record<string, number>> = { neutral: { temperature: 5600, contrast: 0, saturation: 0 }, warm: { temperature: 6500, contrast: 8, saturation: 6 }, cool: { temperature: 4200, contrast: 4, saturation: -2 }, film: { temperature: 5600, contrast: 12, saturation: -8 } }; setColor({ ...color, ...presets[name] }); notify(`${name[0].toUpperCase()}${name.slice(1)} look applied`); }} title={`${name} look`} data-testid={`button-look-${name}`} />)}</div></div>
    <div className="inspector-section"><div className="section-title">Audio cleanup</div><div className="toggle-row">Noise reduction <button className={`toggle ${audio.denoise ? 'on' : ''}`} onClick={() => setAudio({ ...audio, denoise: !audio.denoise })} data-testid="toggle-denoise" /></div><div className="toggle-row">Voice enhancement <button className={`toggle ${audio.voice ? 'on' : ''}`} onClick={() => setAudio({ ...audio, voice: !audio.voice })} data-testid="toggle-voice" /></div><ControlRow label="Volume" value={audio.volume} min={0} max={140} output={`${audio.volume}%`} onChange={(value) => setAudio({ ...audio, volume: value })} /></div>
  </>;
}

function ControlRow({ label, value, min, max, output, onChange }: { label: string; value: number; min: number; max: number; output: string; onChange: (value: number) => void }) {
  return <div className="control-row"><label>{label}</label><input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} aria-label={label} data-testid={`input-${label.toLowerCase().replace(' ', '-')}`} /><span className="control-value">{output}</span></div>;
}

function Timeline({ clips, selectedClipId, setSelectedClipId, addTitle, addMarker, addThumb, title }: { clips: Clip[]; selectedClipId: string; setSelectedClipId: (id: string) => void; addTitle: () => void; addMarker: () => void; addThumb: () => void; title: string }) {
  const laneClips = (lane: Clip['lane']) => clips.filter((clip) => clip.lane === lane);
  const renderLane = (lane: Clip['lane']) => <div className="track">{laneClips(lane).map((clip) => <button key={clip.id} className={`timeline-clip ${clip.color === 'violet' ? 'broll' : clip.color === 'amber' ? 'audio' : ''} ${clip.id === selectedClipId ? 'selected' : ''}`} style={{ left: `${clip.left}%`, width: `${clip.width}%` }} onClick={() => setSelectedClipId(clip.id)} data-testid={`timeline-clip-${clip.id}`}>{clip.name}<span className="wave" /></button>)}{lane === 'broll' && title && <button className="timeline-clip title-clip selected" style={{ left: '29%', width: '12%' }} onClick={addTitle} data-testid="timeline-title-clip">T&nbsp; {title}</button>}</div>;
  return <section className="timeline-panel"><div className="timeline-head"><div className="timeline-title"><span className="eyebrow">TIMELINE</span><strong>Rough cut 01</strong><button className="tiny-add" onClick={() => addMarker()} data-testid="button-add-track"><Plus size={15} /></button></div><div className="timeline-actions"><button onClick={addTitle} data-testid="button-add-title">T <span>Title</span></button><button onClick={addMarker} data-testid="button-add-marker">◇ <span>Marker</span></button><button onClick={addThumb} data-testid="button-add-thumbnail">▣ <span>Thumbnail</span></button><span className="hairline" /><button onClick={() => addMarker()} data-testid="button-zoom-out">−</button><span className="timeline-zoom">62%</span><button onClick={() => addMarker()} data-testid="button-zoom-in">+</button></div></div><div className="timeline-ruler"><span>00:00</span><span>00:15</span><span>00:30</span><span>00:45</span><span>01:00</span><span>01:15</span></div><div className="timeline-body"><div className="track-labels"><div className="track-label"><span className="track-icon">V1</span>Picture</div><div className="track-label secondary"><span className="track-icon">V2</span>B-roll</div><div className="track-label"><span className="track-icon">A1</span>Dialogue</div><div className="track-label secondary"><span className="track-icon">A2</span>Music</div></div><div className="tracks">{renderLane('picture')}{renderLane('broll')}{renderLane('dialogue')}<div className="track" /></div></div></section>;
}

type ConsolePage = 'overview' | 'users' | 'installations' | 'live' | 'releases' | 'email' | 'analytics';
const consoleMeta: Record<ConsolePage, [string, string, string, string]> = {
  overview: ['Overview', 'PRODUCT OPERATIONS', 'Good morning, Nour Studio.', 'A clear view of your product, people, and releases.'],
  users: ['Users', 'PEOPLE', 'Everyone using Nour.', 'Accounts, communication preferences, and recent activity.'],
  installations: ['Installations', 'DISTRIBUTION', 'Nour in the wild.', 'Downloads, first launches, versions, and devices.'],
  live: ['Live activity', 'RIGHT NOW', 'A live pulse of Nour.', 'Approximate activity from opted-in desktop sessions.'],
  releases: ['Releases', 'PRODUCT', 'Ship with confidence.', 'Manage versions, release notes, and update channels.'],
  email: ['Email', 'COMMUNICATIONS', 'Keep your people in the loop.', 'Send thoughtful product updates to people who opted in.'],
  analytics: ['Analytics', 'INSIGHTS', 'Understand the product.', 'Aggregate usage signals without collecting creative work.'],
};
const users = [
  { initials: 'SL', name: 'Sofia Larsson', email: 'sofia@example.com', version: '0.1.0', device: 'Apple Silicon', status: 'Active', last: '2 min ago', tone: '' },
  { initials: 'YA', name: 'Yassine Amrani', email: 'yassine@example.com', version: '0.1.0', device: 'Apple Silicon', status: 'Active', last: '18 min ago', tone: 'gold' },
  { initials: 'EM', name: 'Emma Martin', email: 'emma@example.com', version: '0.0.9', device: 'Intel', status: 'Offline', last: 'Yesterday', tone: 'blue' },
  { initials: 'KN', name: 'Karim Nouri', email: 'karim@example.com', version: '0.1.0', device: 'Apple Silicon', status: 'Active', last: 'Yesterday', tone: 'rose' },
  { initials: 'LH', name: 'Lina Haddad', email: 'lina@example.com', version: '0.0.9', device: 'Apple Silicon', status: 'Invited', last: '—', tone: 'gold' },
];

function ConsolePageView() {
  const [page, setPage] = useState<ConsolePage>('overview');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'release' | 'email' | null>(null);
  const { message, notify } = useLocalToast();
  const [crumb, overline, heading, description] = consoleMeta[page];
  const filteredUsers = useMemo(() => users.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(search.toLowerCase())), [search]);
  const nav: Array<[ConsolePage, string, typeof LayoutDashboard]> = [['overview', 'Overview', LayoutDashboard], ['users', 'Users', Users], ['installations', 'Installations', Download], ['live', 'Live activity', Activity], ['releases', 'Releases', Rocket], ['email', 'Email', Mail], ['analytics', 'Analytics', BarChart3]];
  const primary = () => {
    if (page === 'overview' || page === 'releases') setModal('release');
    else if (page === 'email') setModal('email');
    else notify(`${consoleMeta[page][0]} action is ready for the backend phase`);
  };
  return <div className="console-app">
    <aside className="console-sidebar">
      <Link href="/console/" className="console-brand" data-testid="link-console-home"><NourMark /><div><div className="brand-name">NOUR</div><small>console</small></div></Link>
      <button className="workspace-switcher" onClick={() => notify('Workspace switcher is ready')} data-testid="button-workspace-switcher"><span className="workspace-avatar">N</span><div><strong>Nour Studio</strong><span>Personal workspace</span></div><ChevronDown className="down" size={15} /></button>
      <nav className="console-nav" aria-label="Console navigation"><p className="nav-label">Workspace</p>{nav.slice(0, 4).map(([key, label, Icon]) => <button key={key} className={`console-nav-item ${page === key ? 'active' : ''}`} onClick={() => setPage(key)} data-testid={`nav-console-${key}`}><Icon size={15} /><span>{label}</span></button>)}<p className="nav-label spaced">Product</p>{nav.slice(4).map(([key, label, Icon]) => <button key={key} className={`console-nav-item ${page === key ? 'active' : ''}`} onClick={() => setPage(key)} data-testid={`nav-console-${key}`}><Icon size={15} /><span>{label}</span></button>)}</nav>
      <div className="console-side-bottom"><div className="build-badge"><span className="pulse" /><div><strong>Demo data</strong><small>Local preview mode</small></div></div><button className="console-nav-item" onClick={() => notify('Console settings are ready')} data-testid="button-console-settings"><Settings size={15} /><span>Settings</span></button><div className="admin-row"><span className="admin-avatar">MC</span><div><strong>Admin</strong><span>Owner</span></div><button className="more" onClick={() => notify('Account menu opened')} data-testid="button-admin-menu"><MoreHorizontal size={15} /></button></div></div>
    </aside>
    <main className="console-main">
      <header className="console-topbar"><div className="breadcrumbs"><span>Nour Console</span><b>/</b><strong>{crumb}</strong></div><div className="topbar-actions"><Link href="/" className="desktop-link" data-testid="link-back-to-desktop"><ArrowLeft size={13} /><span>Back to Desktop</span></Link><button className="help-button" onClick={() => notify('Help center is ready')} data-testid="button-console-help"><CircleHelp size={14} /> <span>Help</span></button><button className="notification-button" onClick={() => notify('No new notifications')} data-testid="button-notifications"><Bell size={17} /><i /></button><span className="console-avatar">MC</span></div></header>
      <div className="console-content"><div className="page-heading"><div><p className="overline">{overline}</p><h1>{heading}</h1><p>{description}</p></div><div className="heading-actions"><span className="demo-chip"><span /> Preview data</span><button className="console-btn" onClick={() => notify('Date range selector ready')} data-testid="button-date-range">Last 30 days <ChevronDown size={12} /></button><button className="console-btn primary" onClick={primary} data-testid="button-console-primary">{page === 'email' ? 'Compose email' : page === 'live' ? 'Refresh' : page === 'installations' ? 'Download report' : page === 'users' ? 'Invite user' : page === 'analytics' ? 'Export report' : page === 'releases' ? 'New release' : 'New release'} <b>+</b></button></div></div>
        {page === 'overview' && <Overview setPage={setPage} notify={notify} />}
        {page === 'users' && <UsersPage users={filteredUsers} search={search} setSearch={setSearch} notify={notify} />}
        {page === 'installations' && <Installations notify={notify} />}
        {page === 'live' && <LivePage notify={notify} />}
        {page === 'releases' && <Releases openModal={() => setModal('release')} />}
        {page === 'email' && <EmailPage openModal={() => setModal('email')} />}
        {page === 'analytics' && <Analytics notify={notify} />}
      </div>
    </main>
    {modal && <ConsoleModal type={modal} close={() => setModal(null)} save={() => { setModal(null); notify(modal === 'release' ? 'Release saved as a local draft' : 'Email saved as a local draft'); }} />}
    {message && <div className="console-toast show" role="status" data-testid="status-console-toast">{message}</div>}
  </div>;
}

function Metric({ icon, label, number, change, neutral }: { icon: string; label: string; number: string; change: string; neutral?: boolean }) {
  return <article className="metric-card" data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><strong className="metric-number">{number}</strong><span className={`metric-change ${neutral ? 'neutral' : ''}`}>{change}</span></article>;
}
function Overview({ setPage, notify }: { setPage: (page: ConsolePage) => void; notify: (message: string) => void }) {
  return <><div className="metric-grid"><Metric icon="↓" label="Downloads" number="1,284" change="↗ 18.4% vs. last month" /><Metric icon="◎" label="Activated users" number="846" change="↗ 12.1% vs. last month" /><Metric icon="◉" label="Active this month" number="612" change="↗ 9.7% vs. last month" /><Metric icon="●" label="Live now" number="24" change="Updated just now" neutral /></div><div className="dashboard-grid"><section className="console-card chart-card"><CardHeader title="Product activity" copy="Downloads and active users over the last 30 days" action="View report" onClick={() => setPage('analytics')} /><div className="chart-wrap"><div className="chart-legend"><span className="legend-key"><i />Downloads</span><span className="legend-key"><i />Active users</span></div><div className="chart"><div className="y-labels"><span>400</span><span>300</span><span>200</span><span>100</span><span>0</span></div><div className="chart-area"><div className="grid-lines"><svg className="line-svg" viewBox="0 0 700 180" preserveAspectRatio="none"><path className="downloads" d="M0,154 C38,150 55,124 85,142 S130,100 160,116 S205,89 235,105 S278,52 315,83 S355,73 392,74 S430,48 465,66 S505,24 545,50 S590,30 620,42 S666,18 700,24" /><path className="active" d="M0,166 C38,161 55,146 85,155 S130,133 160,143 S205,123 235,131 S278,102 315,119 S355,99 392,109 S430,87 465,101 S505,78 545,92 S590,68 620,77 S666,61 700,67" /></svg></div><div className="x-labels"><span>Aug 07</span><span>Aug 14</span><span>Aug 21</span><span>Aug 28</span><span>Sep 05</span></div></div></div></div></section><section className="console-card version-card"><CardHeader title="Version adoption" copy="Installed Nour versions" action="Manage" onClick={() => setPage('releases')} /><div className="version-list">{[['0.1.0', 'Current release', '68%', 68], ['0.0.9', 'Previous release', '24%', 24], ['0.0.8', 'Older release', '6%', 6], ['Other', 'Unrecognized', '2%', 2]].map((version, index) => <div className="version-row" key={version[0]}><div className="version-ring">{index === 0 ? '✓' : version[2]}</div><div className="version-details"><strong>{version[0]}</strong><span>{version[1]}</span></div><span className="version-percent">{version[2]}</span><div className="version-bar"><i style={{ width: `${version[3]}%` }} /></div></div>)}</div></section></div><div className="lower-grid"><MiniCard title="Recent activity" copy="Across your product" action="See all" onClick={() => setPage('live')} rows={[['green', 'New installation', 'Sofia Larsson · Apple Silicon', '2m'], ['blue', 'Release downloaded', 'Nour 0.1.0 · 4 devices', '1h'], ['', 'New account', 'Yassine Amrani opted in', '3h']]} /><MiniCard title="Top project types" copy="What people are making" action="Details" onClick={() => setPage('analytics')} rows={[['', 'Documentary', '32% of projects', '→'], ['green', 'Wedding film', '24% of projects', '→'], ['blue', 'Interview', '18% of projects', '→']]} /><MiniCard title="Release health" copy="0.1.0 · current" action="Healthy" onClick={() => notify('Release health is healthy')} rows={[['green', 'Crash-free sessions', '99.2% in the last 7 days', '99.2%'], ['green', 'Update success', 'Last 100 installations', '98%'], ['blue', 'Support requests', '3 open conversations', '3']]} /></div></>;
}
function CardHeader({ title, copy, action, onClick }: { title: string; copy: string; action: string; onClick: () => void }) { return <div className="console-card-header"><div><h2>{title}</h2><p>{copy}</p></div><button className="card-link" onClick={onClick} data-testid={`button-card-${title.toLowerCase().replaceAll(' ', '-')}`}>{action} →</button></div>; }
function MiniCard({ title, copy, action, onClick, rows }: { title: string; copy: string; action: string; onClick: () => void; rows: string[][] }) { return <section className="console-card mini-card"><CardHeader title={title} copy={copy} action={action} onClick={onClick} /><div className="activity-list">{rows.map((row, index) => <div className="activity-row" key={row[1]}><i className={`activity-dot ${row[0]}`} /><div><strong>{row[1]}</strong><span>{row[2]}</span></div><small className="activity-time">{row[3]}</small></div>)}</div></section>; }

function UsersPage({ users: rows, search, setSearch, notify }: { users: typeof users; search: string; setSearch: (value: string) => void; notify: (message: string) => void }) {
  return <section className="console-card table-card"><div className="console-card-header"><div><h2>Users</h2><p>Account and communication status</p></div><button className="console-btn" onClick={() => notify('User report export will be connected to the backend later')} data-testid="button-export-users">Export CSV</button></div><div className="table-toolbar"><label className="search-box"><Search size={13} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users or email..." aria-label="Search users" data-testid="input-search-users" /></label><button className="console-btn" onClick={() => notify('User filters are ready')} data-testid="button-filter-users"><ListFilter size={12} /> All users</button></div><table><thead><tr><th>User</th><th>Version</th><th>Device</th><th>Status</th><th>Last active</th><th /></tr></thead><tbody>{rows.length ? rows.map((user) => <tr key={user.email}><td><div className="user-cell"><span className={`user-mini ${user.tone}`}>{user.initials}</span><div><strong>{user.name}</strong><br /><span>{user.email}</span></div></div></td><td>{user.version}</td><td>{user.device}</td><td><span className={`status ${user.status.toLowerCase()}`}><i />{user.status}</span></td><td>{user.last}</td><td><button className="table-actions" onClick={() => notify(`${user.name} menu opened`)} data-testid={`button-user-menu-${user.initials}`}><MoreHorizontal size={14} /></button></td></tr>) : <tr><td colSpan={6}><div className="empty-row">No users match this search.</div></td></tr>}</tbody></table></section>;
}
function Installations({ notify }: { notify: (message: string) => void }) { return <><div className="page-card-grid"><InfoCard icon="↓" title="1,284 downloads" copy="Installer downloads across all Nour release channels in the selected period." /><InfoCard icon="◎" title="846 first launches" copy="Each installation registers once, with an anonymous device identifier." /><InfoCard icon="⌘" title="82% Apple Silicon" copy="Hardware distribution helps prioritize native performance work." /></div><TableCard title="Latest installations" copy="Only opted-in product telemetry is shown here." action="Download report" onClick={() => notify('Installation report prepared')} headers={['Installation', 'Version', 'Architecture', 'First launch', 'Last seen', 'Telemetry']} rows={users.slice(0, 4).map((user, index) => [user.name, user.version, user.device, `${index + 1} day${index ? 's' : ''} ago`, user.last, 'Opted in'])} /></>; }
function LivePage({ notify }: { notify: (message: string) => void }) { return <><div className="live-banner"><span className="live-pulse" /><strong className="live-number">24</strong><div><strong>people are using Nour right now</strong><span>Based on a recent heartbeat from opted-in desktop sessions. Updated just now.</span></div><button className="console-btn" onClick={() => notify('Live activity refreshed')} data-testid="button-refresh-live"><RefreshCw size={12} /> Refresh</button></div><TableCard title="Live sessions" copy="Approximate activity—never media content." action="Live" onClick={() => notify('Live sessions are current')} headers={['User', 'Version', 'Workspace', 'Current area', 'Session']} rows={users.slice(0, 4).map((user, index) => [user.name, user.version, ['Local project', 'Untitled film', 'Wedding 2026', 'Brand story'][index], ['Edit', 'Color', 'Media', 'Timeline'][index], ['18m', '42m', '7m', '1h 12m'][index]])} /></>; }
function Releases({ openModal }: { openModal: () => void }) { return <><section className="console-card table-card"><div className="console-card-header"><div><h2>Release channels</h2><p>Control what users receive and when.</p></div><button className="console-btn primary" onClick={openModal} data-testid="button-create-release">New release <b>+</b></button></div>{[['0.1.0', 'Current stable', 'Published Sep 04, 2026', '68% adoption', 'Stable'], ['0.0.9', 'Previous stable', 'Published Aug 18, 2026', '24% adoption', 'Archived'], ['0.0.8', 'Legacy', 'Published Jul 30, 2026', '6% adoption', 'Archived']].map((release) => <div className="release-item" key={release[0]}><div className="release-badge">{release[0]}</div><div><strong>{release[1]}</strong><span>{release[2]} · {release[3]}</span></div><span className="release-status">{release[4]}</span><button className="table-actions" onClick={openModal} data-testid={`button-release-menu-${release[0]}`}><MoreHorizontal size={14} /></button></div>)}</section><InfoCard icon="↥" title="Automatic update checks" copy="Nour Desktop can check this release service on launch and show an optional or required update without storing project media online." /></>; }
function EmailPage({ openModal }: { openModal: () => void }) { return <div className="email-composer"><section className="console-card composer-card"><h2>Compose a product update</h2><p>Send only to people who have opted in to product communications.</p><div className="form-field"><label>Subject</label><input defaultValue="Nour 0.1.0 is ready" data-testid="input-email-subject" /></div><div className="form-field"><label>Audience</label><select data-testid="select-email-audience"><option>Product updates · 612 opted in</option><option>Early access · 184 opted in</option><option>All active users · 612 opted in</option></select></div><div className="form-field"><label>Message</label><textarea defaultValue="A new version of Nour is ready. This release improves the local editing workflow and adds the first thumbnail and title tools." data-testid="input-email-body" /></div><button className="console-btn primary" onClick={openModal} data-testid="button-preview-email">Preview email <b>→</b></button></section><section className="console-card composer-card"><h2>Communication rules</h2><p>Build trust into the product from the start.</p><div className="audience-list"><label className="audience-option"><input type="checkbox" defaultChecked /> Product updates</label><label className="audience-option"><input type="checkbox" /> Tips and inspiration</label><label className="audience-option"><input type="checkbox" /> Early access releases</label></div><InfoCard icon="✓" title="No media data in email tools" copy="Only account and communication preference data belongs here. Projects stay on the user’s computer." /></section></div>; }
function Analytics({ notify }: { notify: (message: string) => void }) { return <><div className="page-card-grid"><InfoCard icon="◒" title="32% documentary" copy="The most selected project type in the last 30 days." /><InfoCard icon="◐" title="61% exported" copy="Activated users who completed at least one export." /><InfoCard icon="T" title="Arabic captions" copy="Caption language usage can be tracked as an aggregate product signal." /></div><TableCard title="Feature adoption" copy="Aggregate signals, never creative content." action="Export report" onClick={() => notify('Analytics report prepared')} headers={['Feature', 'Activated users', 'Change', 'Signal']} rows={[['Basic color grading', '74%', '+12%', 'Growing'], ['Thumbnail capture', '52%', '+21%', 'Growing'], ['Audio cleanup', '38%', '+9%', 'Growing'], ['AI analysis', '—', 'Not connected', 'Planned']]} /></>; }
function InfoCard({ icon, title, copy }: { icon: string; title: string; copy: string }) { return <section className="console-card info-card"><div className="info-icon">{icon}</div><h2>{title}</h2><p>{copy}</p></section>; }
function TableCard({ title, copy, action, onClick, headers, rows }: { title: string; copy: string; action: string; onClick: () => void; headers: string[]; rows: string[][] }) { return <section className="console-card table-card"><div className="console-card-header"><div><h2>{title}</h2><p>{copy}</p></div><button className="console-btn" onClick={onClick} data-testid={`button-table-${title.toLowerCase().replaceAll(' ', '-')}`}>{action}</button></div><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`}>{cellIndex === 0 ? <strong>{cell}</strong> : cellIndex === row.length - 1 ? <span className="status active"><i />{cell}</span> : cell}</td>)}</tr>)}</tbody></table></section>; }
function ConsoleModal({ type, close, save }: { type: 'release' | 'email'; close: () => void; save: () => void }) { return <div className="modal-backdrop" onClick={close}><div className="modal" onClick={(event) => event.stopPropagation()}><button className="icon-btn" onClick={close} style={{ float: 'right' }} data-testid="button-close-modal"><X size={15} /></button><p className="overline">{type === 'release' ? 'NEW RELEASE' : 'EMAIL PREVIEW'}</p><h2>{type === 'release' ? 'Prepare a Nour release' : 'Nour 0.1.0 is ready'}</h2><p>{type === 'release' ? 'Set the version, release notes, and update channel. This local preview will not publish anything yet.' : 'This message will be sent only to users who have opted in. The email provider will be connected later.'}</p>{type === 'release' ? <><div className="form-field"><label>Version</label><input defaultValue="0.1.1" data-testid="input-release-version" /></div><div className="form-field"><label>Release notes</label><textarea placeholder="What changed?" data-testid="input-release-notes" /></div></> : <div className="console-card" style={{ padding: 14 }}><p style={{ margin: 0, color: '#1f2428' }}>A new version of Nour is ready. This release improves the local editing workflow and adds the first thumbnail and title tools.</p></div>}<div className="modal-actions"><button className="console-btn" onClick={close} data-testid="button-cancel-modal">Cancel</button><button className="console-btn primary" onClick={save} data-testid="button-save-modal">Save as draft <b>→</b></button></div></div></div>; }

function Router() {
  return <ErrorBoundary resetKey={window.location.pathname}><Switch><Route path="/" component={EditorPage} /><Route path="/console" component={ConsolePageView} /><Route path="/console/" component={ConsolePageView} /><Route component={NotFound} /></Switch></ErrorBoundary>;
}
function App() {
  return <TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider>;
}
export default App;