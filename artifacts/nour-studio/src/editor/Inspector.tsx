import React from 'react';
import { Trash, RotateCcw } from 'lucide-react';
import { EditorController, MediaAsset, TimelineClip, formatTime, Adjustments, StoryRole, TextOverlay, TextOverlayKind, TextOverlayPosition } from './types';

export function Inspector({ editor }: { editor: EditorController }) {
  const handleDeleteAsset = (assetId: string) => {
    const linkedClips = editor.clips.filter(c => c.assetId === assetId);
    if (linkedClips.length > 0) {
      if (!window.confirm(`This asset is used in ${linkedClips.length} clips. Deleting it will remove them from the timeline. Are you sure?`)) {
        return;
      }
    }
    editor.removeAsset(assetId);
  };

  const handleDeleteClip = (clipId: string) => {
    editor.removeClip(clipId);
  };

  return (
    <aside className="panel-inspector">
      <div className="panel-header">
        <h3>Properties</h3>
      </div>
      <div className="inspector-content">
        {editor.mode === 'source' && editor.selectedAssetId ? (
          <AssetProperties 
            asset={editor.assets.find(a => a.id === editor.selectedAssetId)!} 
            onDelete={() => handleDeleteAsset(editor.selectedAssetId!)}
            updateAdjustments={(changes) => editor.updateAssetAdjustments(editor.selectedAssetId!, changes)}
            resetAdjustments={() => editor.resetAssetAdjustments(editor.selectedAssetId!)}
            setRole={(role) => editor.setAssetRole(editor.selectedAssetId!, role)}
          />
        ) : editor.mode === 'timeline' && editor.selectedClipId ? (
          <ClipProperties 
            clip={editor.clips.find(c => c.id === editor.selectedClipId)!}
            asset={editor.assets.find(a => a.id === editor.clips.find(c => c.id === editor.selectedClipId)?.assetId)!}
            updateClip={(changes) => editor.updateClip(editor.selectedClipId!, changes)}
            onDelete={() => handleDeleteClip(editor.selectedClipId!)}
            updateAdjustments={(changes) => editor.updateAssetAdjustments(editor.clips.find(c => c.id === editor.selectedClipId)!.assetId, changes)}
            resetAdjustments={() => editor.resetAssetAdjustments(editor.clips.find(c => c.id === editor.selectedClipId)!.assetId)}
            setRole={(role) => editor.setAssetRole(editor.clips.find(c => c.id === editor.selectedClipId)!.assetId, role)}
            split={() => editor.splitClipAtPlayhead(editor.selectedClipId!)}
          />
        ) : (
          <div className="empty-inspector">Select an item to view properties.</div>
        )}
        <OverlayProperties editor={editor} />
      </div>
    </aside>
  );
}

function OverlayProperties({ editor }: { editor: EditorController }) {
  return <section className="overlay-properties">
    <div className="overlay-heading"><h4>Text overlays</h4><div className="overlay-actions">
      <button className="reset-btn" onClick={() => editor.addOverlay('title')}>+ Title</button>
      <button className="reset-btn" onClick={() => editor.addOverlay('caption')}>+ Caption</button>
    </div></div>
    {editor.overlays.length === 0 && <p className="adjustment-note">Add a title or caption at the current playhead.</p>}
    {editor.overlays.map(overlay => <OverlayRow key={overlay.id} overlay={overlay} update={(changes) => editor.updateOverlay(overlay.id, changes)} remove={() => editor.removeOverlay(overlay.id)} />)}
  </section>;
}

function OverlayRow({ overlay, update, remove }: { overlay: TextOverlay, update: (changes: Partial<Pick<TextOverlay, 'kind' | 'text' | 'start' | 'duration' | 'position'>>) => void, remove: () => void }) {
  return <div className="overlay-row">
    <div className="overlay-row-title"><strong>{overlay.kind}</strong><button className="overlay-delete" onClick={remove}><Trash size={12} /></button></div>
    <div className="prop-group"><label>Text</label><input value={overlay.text} onChange={e => update({ text: e.target.value })} /></div>
    <div className="overlay-grid">
      <div className="prop-group"><label>Start (s)</label><input type="number" min="0" step="0.1" value={overlay.start} onChange={e => update({ start: parseFloat(e.target.value) })} /></div>
      <div className="prop-group"><label>Duration (s)</label><input type="number" min="0.1" step="0.1" value={overlay.duration} onChange={e => update({ duration: parseFloat(e.target.value) })} /></div>
    </div>
    <div className="overlay-grid">
      <div className="prop-group"><label>Kind</label><select value={overlay.kind} onChange={e => update({ kind: e.target.value as TextOverlayKind })}><option value="title">Title</option><option value="caption">Caption</option></select></div>
      <div className="prop-group"><label>Position</label><select value={overlay.position} onChange={e => update({ position: e.target.value as TextOverlayPosition })}><option value="top">Top</option><option value="center">Center</option><option value="bottom">Bottom</option></select></div>
    </div>
  </div>;
}

function ColorAdjustments({ asset, updateAdjustments, resetAdjustments }: { asset: MediaAsset, updateAdjustments: (changes: Partial<Adjustments>) => void, resetAdjustments: () => void }) {
  if (asset.kind === 'audio') return null;
  return (
    <div className="adjustments-section">
      <h5>Preview Adjustments</h5>
      <p className="adjustment-note">Preview metadata only. Saved in project, not rendered.</p>

      <div className="prop-group">
        <label>Exposure</label>
        <div className="slider-with-val">
          <input type="range" min="0" max="3" step="0.05" value={asset.adjustments?.exposure ?? 1} onChange={(e) => updateAdjustments({ exposure: parseFloat(e.target.value) })} />
          <span>{(asset.adjustments?.exposure ?? 1).toFixed(2)}</span>
        </div>
      </div>
      <div className="prop-group">
        <label>Contrast</label>
        <div className="slider-with-val">
          <input type="range" min="0" max="3" step="0.05" value={asset.adjustments?.contrast ?? 1} onChange={(e) => updateAdjustments({ contrast: parseFloat(e.target.value) })} />
          <span>{(asset.adjustments?.contrast ?? 1).toFixed(2)}</span>
        </div>
      </div>
      <div className="prop-group">
        <label>Saturation</label>
        <div className="slider-with-val">
          <input type="range" min="0" max="3" step="0.05" value={asset.adjustments?.saturation ?? 1} onChange={(e) => updateAdjustments({ saturation: parseFloat(e.target.value) })} />
          <span>{(asset.adjustments?.saturation ?? 1).toFixed(2)}</span>
        </div>
      </div>
      {(asset.adjustments) && (
        <button className="reset-btn" onClick={resetAdjustments}>
          <RotateCcw size={12} /> Reset
        </button>
      )}
    </div>
  );
}

function RoleControl({ asset, setRole }: { asset: MediaAsset, setRole: (role: StoryRole) => void }) {
  const roles: StoryRole[] = asset.kind === 'video' ? ['a-roll', 'b-roll'] : asset.kind === 'audio' ? ['audio'] : ['image'];
  return <div className="prop-group"><label htmlFor="asset-role">Story role</label><select id="asset-role" value={asset.role} disabled={roles.length === 1} onChange={e => setRole(e.target.value as StoryRole)}>{roles.map(role => <option key={role} value={role}>{role.toUpperCase()}</option>)}</select></div>;
}
function AssetProperties({ asset, onDelete, updateAdjustments, resetAdjustments, setRole }: { asset: MediaAsset, onDelete: () => void, updateAdjustments: (c: Partial<Adjustments>) => void, resetAdjustments: () => void, setRole: (role: StoryRole) => void }) {
  if (!asset) return null;
  return (
    <div className="properties-form">
      <h4>{asset.name}</h4>
      <div className="prop-row"><span>Kind:</span> <span>{asset.kind}</span></div>
      <div className="prop-row"><span>Duration:</span> <span>{formatTime(asset.duration)}</span></div>
      <RoleControl asset={asset} setRole={setRole} />
      {asset.width && <div className="prop-row"><span>Resolution:</span> <span>{asset.width}x{asset.height}</span></div>}
      
      <ColorAdjustments asset={asset} updateAdjustments={updateAdjustments} resetAdjustments={resetAdjustments} />

      <button className="danger-btn" onClick={onDelete}>
        <Trash size={14} /> Delete Asset
      </button>
    </div>
  );
}

function ClipProperties({ clip, asset, updateClip, onDelete, updateAdjustments, resetAdjustments, setRole, split }: { clip: TimelineClip, asset: MediaAsset, updateClip: (c: Partial<Pick<TimelineClip, 'start' | 'trimStart' | 'duration' | 'volume' | 'muted'>>) => void, onDelete: () => void, updateAdjustments: (c: Partial<Adjustments>) => void, resetAdjustments: () => void, setRole: (role: StoryRole) => void, split: () => void }) {
  if (!clip || !asset) return null;
  return (
    <div className="properties-form">
      <h4>{asset.name}</h4>
      <RoleControl asset={asset} setRole={setRole} />
      <button className="reset-btn" onClick={split}>Split at playhead</button>
      
      <div className="prop-group">
        <label htmlFor="clip-start">Start Position (s)</label>
        <div className="time-input">
          <input id="clip-start" type="number" step="0.1" min="0" value={clip.start.toFixed(2)} onChange={(e) => updateClip({ start: parseFloat(e.target.value) })} />
        </div>
      </div>

      <div className="prop-group">
        <label htmlFor="clip-trim">Trim Start (s)</label>
        <div className="time-input">
          <input id="clip-trim" type="number" step="0.1" min="0" max={asset.duration - 0.1} value={clip.trimStart.toFixed(2)} onChange={(e) => updateClip({ trimStart: parseFloat(e.target.value) })} />
        </div>
      </div>

      <div className="prop-group">
        <label htmlFor="clip-duration">Duration (s)</label>
        <div className="time-input">
          <input id="clip-duration" type="number" step="0.1" min="0.1" max={asset.duration - clip.trimStart} value={clip.duration.toFixed(2)} onChange={(e) => updateClip({ duration: parseFloat(e.target.value) })} />
        </div>
      </div>

      {clip.track === 'audio' || asset.kind === 'audio' || asset.kind === 'video' ? (
        <div className="prop-group">
          <label htmlFor="clip-volume">Volume</label>
          <input id="clip-volume" type="range" min="0" max="1" step="0.01" value={clip.muted ? 0 : clip.volume} onChange={(e) => updateClip({ volume: parseFloat(e.target.value) })} />
        </div>
      ) : null}

      <ColorAdjustments asset={asset} updateAdjustments={updateAdjustments} resetAdjustments={resetAdjustments} />

      <button className="danger-btn" onClick={onDelete}>
        <Trash size={14} /> Delete Clip
      </button>
    </div>
  );
}
