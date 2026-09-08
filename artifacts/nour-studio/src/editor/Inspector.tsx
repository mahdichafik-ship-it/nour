import React from 'react';
import { Trash, RotateCcw } from 'lucide-react';
import { EditorController, MediaAsset, TimelineClip, formatTime, Adjustments } from './types';

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
          />
        ) : editor.mode === 'timeline' && editor.selectedClipId ? (
          <ClipProperties 
            clip={editor.clips.find(c => c.id === editor.selectedClipId)!}
            asset={editor.assets.find(a => a.id === editor.clips.find(c => c.id === editor.selectedClipId)?.assetId)!}
            updateClip={(changes) => editor.updateClip(editor.selectedClipId!, changes)}
            onDelete={() => handleDeleteClip(editor.selectedClipId!)}
            updateAdjustments={(changes) => editor.updateAssetAdjustments(editor.clips.find(c => c.id === editor.selectedClipId)!.assetId, changes)}
            resetAdjustments={() => editor.resetAssetAdjustments(editor.clips.find(c => c.id === editor.selectedClipId)!.assetId)}
          />
        ) : (
          <div className="empty-inspector">Select an item to view properties.</div>
        )}
      </div>
    </aside>
  );
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

function AssetProperties({ asset, onDelete, updateAdjustments, resetAdjustments }: { asset: MediaAsset, onDelete: () => void, updateAdjustments: (c: Partial<Adjustments>) => void, resetAdjustments: () => void }) {
  if (!asset) return null;
  return (
    <div className="properties-form">
      <h4>{asset.name}</h4>
      <div className="prop-row"><span>Kind:</span> <span>{asset.kind}</span></div>
      <div className="prop-row"><span>Duration:</span> <span>{formatTime(asset.duration)}</span></div>
      {asset.width && <div className="prop-row"><span>Resolution:</span> <span>{asset.width}x{asset.height}</span></div>}
      
      <ColorAdjustments asset={asset} updateAdjustments={updateAdjustments} resetAdjustments={resetAdjustments} />

      <button className="danger-btn" onClick={onDelete}>
        <Trash size={14} /> Delete Asset
      </button>
    </div>
  );
}

function ClipProperties({ clip, asset, updateClip, onDelete, updateAdjustments, resetAdjustments }: { clip: TimelineClip, asset: MediaAsset, updateClip: (c: Partial<Pick<TimelineClip, 'start' | 'trimStart' | 'duration' | 'volume' | 'muted'>>) => void, onDelete: () => void, updateAdjustments: (c: Partial<Adjustments>) => void, resetAdjustments: () => void }) {
  if (!clip || !asset) return null;
  return (
    <div className="properties-form">
      <h4>{asset.name}</h4>
      
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
