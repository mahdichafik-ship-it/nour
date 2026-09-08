import React from 'react';
import { Play, Pause, Volume2, VolumeX, FileAudio } from 'lucide-react';
import { EditorController, formatTime } from './types';
import { EditorPlayback } from './EditorPlayback';

export function PlayerArea({ editor }: { editor: EditorController }) {
  const isSource = editor.mode === 'source';
  const selectedAsset = editor.assets.find(a => a.id === editor.selectedAssetId);
  const title = isSource ? selectedAsset?.name || 'No selection' : editor.projectName;
  const isAudio = isSource && selectedAsset?.kind === 'audio';

  return (
    <main className="panel-player">
      <div className="player-tabs">
        <button 
          className={editor.mode === 'source' ? 'active' : ''} 
          onClick={() => editor.setMode('source')}
        >Source</button>
        <button 
          className={editor.mode === 'timeline' ? 'active' : ''} 
          onClick={() => editor.setMode('timeline')}
        >Timeline</button>
      </div>
      
      <div className="playback-viewport">
        <div className="playback-overlay">
          <div className="playback-title">{isSource ? 'Source' : 'Timeline'}: {title}</div>
          {isAudio && <div className="audio-placeholder"><FileAudio size={48} /></div>}
        </div>
        <EditorPlayback editor={editor} />
      </div>

      <div className="player-controls">
        <button 
          className="play-btn" 
          onClick={editor.togglePlay}
          data-testid="button-play"
          aria-label={editor.playing ? "Pause" : "Play"}
        >
          {editor.playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        
        <div className="time-display">
          {formatTime(editor.currentTime)} / {formatTime(editor.playbackDuration)}
          {editor.buffering && <span role="status">Buffering…</span>}
        </div>

        <input 
          type="range" 
          className="seek-bar"
          min={0}
          max={editor.playbackDuration || 1}
          step={0.1}
          value={editor.currentTime}
          onChange={(e) => editor.seek(parseFloat(e.target.value))}
          data-testid="input-seek"
          aria-label="Seek"
        />

        <div className="volume-control">
          <button 
            onClick={() => editor.setMuted(!editor.muted)}
            title={editor.muted ? "Unmute master" : "Mute master"}
            aria-label={editor.muted ? "Unmute master" : "Mute master"}
          >
            {editor.muted || editor.volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <input 
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={editor.muted ? 0 : editor.volume}
            onChange={(e) => editor.setVolume(parseFloat(e.target.value))}
            data-testid="input-volume"
            aria-label="Master volume"
          />
        </div>
      </div>
    </main>
  );
}
