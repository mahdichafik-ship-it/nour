import React, { useRef, useState } from 'react';
import { Search, Plus, FileVideo, FileAudio, Image as ImageIcon } from 'lucide-react';
import { EditorController, formatTime } from './types';

export function Library({ editor }: { editor: EditorController }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'video' | 'audio' | 'image'>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredAssets = editor.assets.filter(a => {
    if (filter !== 'all' && a.kind !== filter) return false;
    if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleImport = () => {
    if (editor.isNative) {
      editor.importNative();
    } else {
      fileInputRef.current?.click();
    }
  };

  return (
    <aside className="panel-library">
      <div className="panel-header">
        <h3>Media Library ({editor.assets.length})</h3>
        <button 
          className="import-btn" 
          onClick={handleImport} 
          data-testid="button-import"
          disabled={editor.importing}
        >
          <Plus size={14} /> {editor.importing ? 'Importing...' : 'Import'}
        </button>
      </div>
      <div className="library-filters">
        <div className="search-box">
          <Search size={14} />
          <input 
            type="text" 
            placeholder="Search media..." 
            value={search} 
            onChange={e => setSearch(e.target.value)}
            aria-label="Search media"
          />
        </div>
        <div className="filter-chips">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All</button>
          <button className={filter === 'video' ? 'active' : ''} onClick={() => setFilter('video')}>Video</button>
          <button className={filter === 'audio' ? 'active' : ''} onClick={() => setFilter('audio')}>Audio</button>
          <button className={filter === 'image' ? 'active' : ''} onClick={() => setFilter('image')}>Images</button>
        </div>
      </div>
      <div className="library-grid">
        {filteredAssets.map(asset => {
          const usedCount = editor.clips.filter(c => c.assetId === asset.id).length;
          const isSelected = editor.selectedAssetId === asset.id && editor.mode === 'source';

          return (
            <div 
              key={asset.id} 
              className={`asset-card ${isSelected ? 'selected' : ''} ${asset.error ? 'has-error' : ''}`}
              draggable
              tabIndex={0}
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-nour-asset', asset.id);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => {
                editor.setMode('source');
                editor.selectAsset(asset.id);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  editor.setMode('source');
                  editor.selectAsset(asset.id);
                }
              }}
              data-testid={`media-card-${asset.id}`}
            >
              <div className="asset-icon">
                {asset.kind === 'video' ? <FileVideo size={24} /> : asset.kind === 'audio' ? <FileAudio size={24} /> : <ImageIcon size={24} />}
              </div>
              <div className="asset-info">
                <div className="asset-name" title={asset.name}>{asset.name}</div>
                <div className="asset-meta">{formatTime(asset.duration)}</div>
                {asset.error && <div className="asset-error" title={asset.error}>Unsupported</div>}
              </div>
              {usedCount > 0 && <div className="usage-badge" title={`Used ${usedCount} times in timeline`}>On timeline: {usedCount}</div>}
              <button 
                className="add-to-timeline-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  editor.addToTimeline(asset.id);
                }}
                title="Add to timeline"
                aria-label="Add to timeline"
                data-testid="button-add-clip"
              >
                <Plus size={14} />
              </button>
            </div>
          );
        })}
        {filteredAssets.length === 0 && (
          <div className="empty-library">
            <p>Import video, audio or images to begin.</p>
          </div>
        )}
      </div>
      
      <input 
        type="file" 
        multiple 
        hidden 
        ref={fileInputRef} 
        onChange={(e) => {
          if (e.target.files) editor.importFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </aside>
  );
}
