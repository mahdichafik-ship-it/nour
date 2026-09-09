import React, { useRef, DragEvent } from 'react';
import { Volume2, VolumeX, Video } from 'lucide-react';
import { EditorController, formatTime, TimelineClip, Track } from './types';

export const PIXELS_PER_SECOND = 40;

export function Timeline({ editor }: { editor: EditorController }) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTrackDrop = (e: DragEvent, targetTrack: Track) => {
    e.preventDefault();
    e.stopPropagation();
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const scrollLeft = containerRef.current.scrollLeft;
    const x = e.clientX - rect.left + scrollLeft;
    const dropTime = Math.max(0, x / PIXELS_PER_SECOND);

    const assetId = e.dataTransfer.getData('application/x-nour-asset');
    const clipId = e.dataTransfer.getData('application/x-nour-clip');
    const offsetStr = e.dataTransfer.getData('application/x-nour-clip-offset');
    const offset = offsetStr ? parseFloat(offsetStr) : 0;

    if (clipId) {
      editor.moveClip(clipId, Math.max(0, dropTime - offset), targetTrack);
    } else if (assetId) {
      editor.addToTimeline(assetId, dropTime, targetTrack);
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes('application/x-nour-clip') ? 'move' : 'copy';
  };

  const videoClips = editor.clips.filter(c => c.track === 'video');
  const audioClips = editor.clips.filter(c => c.track === 'audio');

  const timelineDuration = Math.max(editor.duration, 60);
  const timelineWidth = timelineDuration * PIXELS_PER_SECOND + 400; // ample padding

  const handleRulerClick = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    editor.setMode('timeline');
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + containerRef.current.scrollLeft;
    editor.seek(Math.max(0, x / PIXELS_PER_SECOND));
  };

  return (
    <section className="panel-timeline">
      <div className="timeline-headers">
        <div className="track-header">
          <span>Video ({videoClips.length})</span>
          <button className={`track-mute-btn ${editor.trackMuted.video ? 'muted' : ''}`} onClick={() => editor.toggleTrackMute('video')} title={editor.trackMuted.video ? "Unmute Video Track" : "Mute Video Track"}>
            {editor.trackMuted.video ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
        </div>
        <div className="track-header">
          <span>Audio ({audioClips.length})</span>
          <button className={`track-mute-btn ${editor.trackMuted.audio ? 'muted' : ''}`} onClick={() => editor.toggleTrackMute('audio')} title={editor.trackMuted.audio ? "Unmute Audio Track" : "Mute Audio Track"}>
            {editor.trackMuted.audio ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
        </div>
      </div>
      
      <div className="timeline-tracks-container" ref={containerRef}>
        {editor.clips.length === 0 && (
          <div className="empty-timeline">
            Drag media here or use + Add to timeline
          </div>
        )}
        <div className="timeline-scroll-area" style={{ width: timelineWidth }}>
          <div className="timeline-ruler" onClick={handleRulerClick}>
            {Array.from({ length: Math.ceil(timelineDuration / 5) + 1 }).map((_, i) => (
              <div key={i} className="ruler-mark" style={{ left: i * 5 * PIXELS_PER_SECOND }}>
                <span className="ruler-time">{formatTime(i * 5)}</span>
              </div>
            ))}
            {editor.mode === 'timeline' && (
              <div className="playhead" style={{ left: editor.currentTime * PIXELS_PER_SECOND }}>
                <div className="playhead-line" />
              </div>
            )}
          </div>

          <div 
            className="timeline-track video-track"
            onDragOver={handleDragOver}
            onDrop={(e) => handleTrackDrop(e, 'video')}
            data-testid="timeline-lane-video"
          >
            {videoClips.map(clip => (
              <ClipNode key={clip.id} clip={clip} editor={editor} />
            ))}
          </div>

          <div 
            className="timeline-track audio-track"
            onDragOver={handleDragOver}
            onDrop={(e) => handleTrackDrop(e, 'audio')}
            data-testid="timeline-lane-audio"
          >
            {audioClips.map(clip => (
              <ClipNode key={clip.id} clip={clip} editor={editor} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ClipNode({ clip, editor }: { clip: TimelineClip, editor: EditorController }) {
  const asset = editor.assets.find(a => a.id === clip.assetId);
  const isSelected = editor.selectedClipId === clip.id && editor.mode === 'timeline';

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('application/x-nour-clip', clip.id);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const timeOffset = offsetX / PIXELS_PER_SECOND;
    e.dataTransfer.setData('application/x-nour-clip-offset', timeOffset.toString());
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      className={`timeline-clip role-${asset?.role ?? clip.track} ${isSelected ? 'selected' : ''}`}
      style={{
        left: clip.start * PIXELS_PER_SECOND,
        width: clip.duration * PIXELS_PER_SECOND,
      }}
      draggable
      tabIndex={0}
      onDragStart={handleDragStart}
      onClick={(e) => {
        e.stopPropagation();
        editor.setMode('timeline');
        editor.selectClip(clip.id);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          editor.setMode('timeline');
          editor.selectClip(clip.id);
        }
      }}
      data-testid={`timeline-clip-${clip.id}`}
      aria-label={`Clip ${asset?.name || 'Unknown'}`}
    >
      <div className="clip-content">
        <span className="clip-name" title={asset?.name}>{asset?.name || 'Unknown'}</span>
        <span className="clip-role">{asset?.role?.toUpperCase()}</span>
        {clip.muted && <VolumeX size={10} className="clip-mute-icon" />}
      </div>
    </div>
  );
}
