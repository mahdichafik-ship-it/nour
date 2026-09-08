import { useState } from 'react';
import { Film, X } from 'lucide-react';
import { AspectRatio, DEFAULT_PROJECT_SETTINGS, ProjectSettings, ProjectType } from './types';

const projectTypes: Array<{ value: ProjectType; label: string; description: string }> = [
  { value: 'documentary', label: 'Documentary', description: 'Long-form story, interviews, and supporting footage.' },
  { value: 'wedding', label: 'Wedding film', description: 'Ceremony, speeches, vows, and highlight moments.' },
  { value: 'interview', label: 'Interview', description: 'Dialogue-first edits with clean room for cutaways.' },
  { value: 'social', label: 'Social / short-form', description: 'Vertical or square content for social platforms.' },
  { value: 'custom', label: 'Custom project', description: 'Start with settings you choose yourself.' },
];

type Props = {
  initialName: string;
  initialSettings: ProjectSettings;
  canCancel: boolean;
  onCreate: (name: string, settings: ProjectSettings) => void;
  onClose: () => void;
};

export function ProjectCreationDialog({ initialName, initialSettings, canCancel, onCreate, onClose }: Props) {
  const [name, setName] = useState(initialName === 'Untitled project' ? '' : initialName);
  const [settings, setSettings] = useState<ProjectSettings>({ ...DEFAULT_PROJECT_SETTINGS, ...initialSettings });
  const selectedType = projectTypes.find(type => type.value === settings.type) ?? projectTypes[4];
  const update = <K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]) => setSettings(current => ({ ...current, [key]: value }));

  return (
    <div className="project-dialog-backdrop" role="presentation">
      <section className="project-dialog" role="dialog" aria-modal="true" aria-labelledby="project-dialog-title">
        {canCancel && <button className="project-dialog-close" onClick={onClose} aria-label="Close project creation"><X size={17} /></button>}
        <div className="project-dialog-icon"><Film size={20} /></div>
        <p className="project-dialog-overline">{canCancel ? 'NEW PROJECT' : 'WELCOME TO NOUR'}</p>
        <h2 id="project-dialog-title">{canCancel ? 'Create a new project' : 'Create your first project'}</h2>
        <p className="project-dialog-copy">
          Choose a project type and delivery format before you start importing media.
          {canCancel && ' Creating this project starts a fresh timeline and clears the current project media from the workspace.'}
        </p>

        <label className="project-field">
          <span>Project name</span>
          <input value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Morocco in motion" autoFocus />
        </label>

        <div className="project-field">
          <span>Video type</span>
          <div className="project-type-grid">
            {projectTypes.map(type => (
              <button key={type.value} type="button" className={`project-type-card ${settings.type === type.value ? 'selected' : ''}`} onClick={() => update('type', type.value)}>
                <strong>{type.label}</strong>
                <small>{type.description}</small>
              </button>
            ))}
          </div>
          <small className="project-selection-note">{selectedType.description}</small>
        </div>

        <div className="project-settings-grid">
          <label className="project-field">
            <span>Aspect ratio</span>
            <select value={settings.aspectRatio} onChange={event => update('aspectRatio', event.target.value as AspectRatio)}>
              <option value="16:9">16:9 · Widescreen</option>
              <option value="9:16">9:16 · Vertical</option>
              <option value="1:1">1:1 · Square</option>
              <option value="4:3">4:3 · Classic</option>
            </select>
          </label>
          <label className="project-field">
            <span>Resolution</span>
            <select value={settings.resolution} onChange={event => update('resolution', event.target.value as ProjectSettings['resolution'])}>
              <option value="3840x2160">4K · 3840 × 2160</option>
              <option value="1920x1080">Full HD · 1920 × 1080</option>
              <option value="1080x1920">Vertical HD · 1080 × 1920</option>
              <option value="1080x1080">Square HD · 1080 × 1080</option>
              <option value="1280x720">HD · 1280 × 720</option>
            </select>
          </label>
          <label className="project-field">
            <span>Frame rate</span>
            <select value={settings.frameRate} onChange={event => update('frameRate', Number(event.target.value) as ProjectSettings['frameRate'])}>
              <option value="24">24 fps · Cinematic</option>
              <option value="25">25 fps · PAL</option>
              <option value="30">30 fps · Standard</option>
              <option value="60">60 fps · Smooth</option>
            </select>
          </label>
        </div>

        <div className="project-dialog-actions">
          {canCancel && <button className="project-secondary" type="button" onClick={onClose}>Cancel</button>}
          <button className="project-primary" type="button" disabled={!name.trim()} onClick={() => onCreate(name, settings)}>Create project</button>
        </div>
      </section>
    </div>
  );
}