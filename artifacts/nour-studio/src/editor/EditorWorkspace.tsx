import React, { useEffect, useState, DragEvent } from 'react';
import { Link } from 'wouter';
import { useEditorEngine } from './use-editor-engine';
import { Plus, ArrowUpRight, FileDown, AlertTriangle, PlusSquare, Undo2, Redo2 } from 'lucide-react';
import { Library } from './Library';
import { PlayerArea } from './PlayerArea';
import { Inspector } from './Inspector';
import { Timeline } from './Timeline';
import DesktopUpdatePrompt from './DesktopUpdatePrompt';
import { ProjectCreationDialog } from './ProjectCreationDialog';
import './editor.css';

function NourMark() {
  return (
    <div className="nour-mark" aria-label="Nour mark">
      <span /><span /><span />
    </div>
  );
}

export default function EditorWorkspace() {
  const editor = useEditorEngine();
  const isNative = !!(window as any).__TAURI__;

  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const [isRendering, setIsRendering] = useState(false);

  useEffect(() => {
    if (editor.saveStatus === 'saved' && !editor.hasProject) setIsProjectDialogOpen(true);
  }, [editor.hasProject, editor.saveStatus]);

  useEffect(() => {
    const handleHistoryShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
      event.preventDefault();
      if (event.shiftKey) editor.redo();
      else editor.undo();
    };
    window.addEventListener('keydown', handleHistoryShortcut);
    return () => window.removeEventListener('keydown', handleHistoryShortcut);
  }, [editor.redo, editor.undo]);

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    if (e.currentTarget === e.target) {
      setIsDraggingOver(false);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      if (editor.isNative) {
        editor.reportError('Cannot drop external files in native mode. Please use the Import media native picker instead.');
      } else {
        editor.importFiles(e.dataTransfer.files);
      }
    }
  };

  return (
    <div 
      className={`nour-workspace ${isNative ? 'is-native' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {!isNative && (
        <section className="mac-download-banner" aria-label="Download Nour for Mac">
          <div className="mac-download-copy">
            <strong>Get Nour for Mac <span>v0.1.6</span></strong>
            <p>Automatic update checks with a native install window.</p>
          </div>
          <div className="mac-download-links">
            <a href="https://github.com/mahdichafik-ship-it/nour/releases/download/v0.1.6/Nour-0.1.6-arm64.dmg">Apple Silicon</a>
            <a href="https://github.com/mahdichafik-ship-it/nour/releases/download/v0.1.6/Nour-0.1.6-x64.dmg">Intel Mac</a>
          </div>
        </section>
      )}

      {editor.error && (
        <div className="error-banner">
          <AlertTriangle size={16} />
          <span>{editor.error}</span>
          <button onClick={editor.clearError}>Dismiss</button>
        </div>
      )}

      {editor.saveStatus === 'loading' && (
        <div className="global-drop-overlay" role="status" aria-live="polite">
          <h2>Restoring your local project…</h2>
        </div>
      )}

      {isDraggingOver && (
        <div className="global-drop-overlay">
          <PlusSquare size={48} />
          <h2>Drop media files to import</h2>
        </div>
      )}

      <header className="workspace-topbar">
        <div className="topbar-left">
          <Link href="/" className="brand-lockup">
            <NourMark />
            <div className="brand-text">
              <span className="brand-name">NOUR</span>
              <span className="brand-sub">workspace</span>
            </div>
          </Link>
        </div>
        <div className="topbar-center">
          <input
            className="project-input" 
            value={editor.projectName} 
            onChange={(e) => editor.setProjectName(e.target.value)}
            aria-label="Project Name"
          />
          <button className="project-settings-summary" onClick={() => setIsProjectDialogOpen(true)} title="Edit project settings">
            {editor.projectSettings.type} · {editor.projectSettings.aspectRatio} · {editor.projectSettings.frameRate} fps
          </button>
          <span className="save-status">{editor.saveStatus}</span>
        </div>
        <div className="topbar-right">
          <div className="history-controls" aria-label="Edit history">
            <button onClick={editor.undo} disabled={!editor.canUndo} title="Undo (⌘Z)" aria-label="Undo"><Undo2 size={14} /></button>
            <button onClick={editor.redo} disabled={!editor.canRedo} title="Redo (⇧⌘Z)" aria-label="Redo"><Redo2 size={14} /></button>
          </div>
          <button className="new-project-btn" onClick={() => setIsProjectDialogOpen(true)}><Plus size={14} /> New project</button>
          <Link href="/console/" className="console-link"><ArrowUpRight size={14} /> Console</Link>
          <button 
            className="export-btn" 
            onClick={async () => { setIsRendering(true); try { await editor.exportVideo(); } finally { setIsRendering(false); } }}
            data-testid="button-export"
            disabled={!isNative || isRendering || editor.saveStatus === 'saving' || editor.saveStatus === 'loading'}
          >
            <FileDown size={14} /> {isRendering ? 'Rendering MP4…' : 'Export MP4'}
          </button>
          <button className="new-project-btn" onClick={editor.exportProject} disabled={editor.saveStatus === 'saving' || editor.saveStatus === 'loading'}>
            Export JSON
          </button>
        </div>
      </header>
      {!isNative && <div className="desktop-export-note" role="status">Finished-video export is desktop-only. Export JSON saves project metadata in the browser.</div>}

      <div className="workspace-middle">
        <Library editor={editor} />
        <PlayerArea editor={editor} />
        <Inspector editor={editor} />
      </div>
      
      <Timeline editor={editor} />
      {isNative && <DesktopUpdatePrompt />}
      {isProjectDialogOpen && (
        <ProjectCreationDialog
          initialName={editor.projectName}
          initialSettings={editor.projectSettings}
          canCancel={editor.hasProject}
          onClose={() => setIsProjectDialogOpen(false)}
          onCreateSample={() => {
            editor.createSampleProject({ ...editor.projectSettings, type: 'documentary' });
            setIsProjectDialogOpen(false);
          }}
          onCreate={(name, settings) => {
            editor.createProject(name, settings);
            setIsProjectDialogOpen(false);
          }}
        />
      )}
    </div>
  );
}
