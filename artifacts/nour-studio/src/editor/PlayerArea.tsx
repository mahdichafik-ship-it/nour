import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, FileAudio, Maximize, Minimize } from 'lucide-react';
import { EditorController, formatTime } from './types';
import { EditorPlayback } from './EditorPlayback';
import { shouldCommitRangeSeek } from './playback-sync';

export function PlayerArea({ editor }: { editor: EditorController }) {
  const isSource = editor.mode === 'source';
  const selectedAsset = editor.assets.find(a => a.id === editor.selectedAssetId);
  const title = isSource ? selectedAsset?.name || 'No selection' : editor.projectName;
  const isAudio = isSource && selectedAsset?.kind === 'audio';

  const viewportRef = useRef<HTMLDivElement>(null);
  const seekPointerActive = useRef(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [draftTime, setDraftTime] = useState<number | null>(null);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      viewportRef.current?.requestFullscreen().catch(err => console.error(err));
    } else {
      document.exitFullscreen().catch(err => console.error(err));
    }
  };

  const previewSeek = (value: number) => {
    setDraftTime(value);
    editor.previewSeek(value);
  };

  const finishPointerSeek = (value: number) => {
    if (!seekPointerActive.current) return;
    seekPointerActive.current = false;
    setDraftTime(null);
    editor.commitSeek(value);
  };

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
      
      <div className="playback-viewport" ref={viewportRef}>
        <div className="playback-overlay">
          <div className="playback-title">{isSource ? 'Source' : 'Timeline'}: {title}</div>
          {isAudio && <div className="audio-placeholder"><FileAudio size={48} /></div>}
        </div>
        <button
          className="fullscreen-btn"
          onClick={toggleFullscreen}
          title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Preview"}
          aria-label={isFullscreen ? "Exit Fullscreen" : "Fullscreen Preview"}
        >
          {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
        </button>
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
          {formatTime(draftTime ?? editor.currentTime)} / {formatTime(editor.playbackDuration)}
          {editor.buffering && <span role="status">Buffering…</span>}
        </div>

        <input 
          type="range" 
          className="seek-bar"
          min={0}
          max={editor.playbackDuration || 1}
          step={0.1}
          value={draftTime ?? editor.currentTime}
          onPointerDown={(e) => {
            seekPointerActive.current = true;
            previewSeek(parseFloat(e.currentTarget.value));
          }}
          onChange={(e) => {
            const value = parseFloat(e.currentTarget.value);
            if (shouldCommitRangeSeek('change', seekPointerActive.current)) {
              setDraftTime(null);
              editor.commitSeek(value);
            } else {
              previewSeek(value);
            }
          }}
          onPointerUp={(e) => {
            if (shouldCommitRangeSeek('pointerup', seekPointerActive.current)) finishPointerSeek(parseFloat(e.currentTarget.value));
          }}
          onPointerCancel={(e) => finishPointerSeek(parseFloat(e.currentTarget.value))}
          onBlur={(e) => finishPointerSeek(parseFloat(e.currentTarget.value))}
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
