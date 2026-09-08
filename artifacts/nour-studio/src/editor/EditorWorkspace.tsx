import React, { useState, DragEvent } from 'react';
import { Link } from 'wouter';
import { useEditorEngine } from './use-editor-engine';
import { Plus, ArrowUpRight, FileDown, AlertTriangle, PlusSquare } from 'lucide-react';
import { Library } from './Library';
import { PlayerArea } from './PlayerArea';
import { Inspector } from './Inspector';
import { Timeline } from './Timeline';
import DesktopUpdatePrompt from './DesktopUpdatePrompt';
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
            <strong>Get Nour for Mac <span>v0.1.4</span></strong>
            <p>Automatic update checks with a native install window.</p>
          </div>
          <div className="mac-download-links">
            <a href="https://github.com/mahdichafik-ship-it/nour/releases/download/v0.1.4/Nour-0.1.4-arm64.dmg">Apple Silicon</a>
            <a href="https://github.com/mahdichafik-ship-it/nour/releases/download/v0.1.4/Nour-0.1.4-x64.dmg">Intel Mac</a>
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
          <span className="save-status">{editor.saveStatus}</span>
        </div>
        <div className="topbar-right">
          <button className="new-project-btn" onClick={() => {
            if (window.confirm('Start a new project? All unsaved changes will be lost.')) {
              editor.newProject();
            }
          }}><Plus size={14} /> New project</button>
          <Link href="/console/" className="console-link"><ArrowUpRight size={14} /> Console</Link>
          <button 
            className="export-btn" 
            onClick={editor.exportProject} 
            data-testid="button-export"
            disabled={editor.saveStatus === 'saving' || editor.saveStatus === 'loading'}
          >
            <FileDown size={14} /> Export JSON
          </button>
        </div>
      </header>

      <div className="workspace-middle">
        <Library editor={editor} />
        <PlayerArea editor={editor} />
        <Inspector editor={editor} />
      </div>
      
      <Timeline editor={editor} />
      {isNative && <DesktopUpdatePrompt />}
    </div>
  );
}
