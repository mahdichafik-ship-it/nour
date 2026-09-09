# Nour release contract

**Status:** authoritative product contract for Nour 1.0 and Nour 2.0  
**Evidence snapshot:** this repository, package version `0.1.5` (not a claim that
either contract has shipped).

This document is the release gate. A feature is not “done” because a control,
type, mock, or design exists: it must work end to end in the stated
environment and have the acceptance evidence described here. “Current status”
below describes only what is evidenced by the repository today. Missing,
partial, or unverified work is explicitly not counted as a release capability.

## Evidence rules

* **Implemented** means the repository contains a connected implementation,
  with a repeatable acceptance test or a native/release verification path.
* **Partial** means some useful behavior exists, but the contract is not met.
* **Not implemented** means no connected product capability is present.
* **Release evidence required** means implementation alone is insufficient:
  the artifact, signature, or end-to-end run must be retained for the release.
* The browser editor and Tauri desktop are separate targets. A browser demo
  does not prove the desktop requirement, and a local project JSON does not
  prove a playable finished-video export.

Repository evidence used for this snapshot includes:

* `src/editor/use-editor-engine.ts`: local persistence, media probing/import,
  timeline operations, preview playback, and project JSON export.
* `src/editor/EditorPlayback.tsx`: browser media playback and preview
  adjustments.
* `src/editor/Library.tsx`, `Timeline.tsx`, and `Inspector.tsx`: current
  editor surface.
* `src-tauri/src/lib.rs`: app-data persistence, atomic state save, and native
  media copying.
* `DESKTOP.md` and `.github/workflows/nour-desktop-release.yml`: desktop
  distribution, signing, notarization, and updater procedures.
* `src/App.tsx`: Console surface. It currently labels itself “Demo data / Local
  preview mode”; its actions are local UI notifications, not authenticated
  product operations.

## Nour 1.0 — local finishing product

### Release promise

Nour 1.0 is a local-first Mac video editor that can take a user from local
media to a playable, finished video without a network connection. Raw media
and project state remain local by default. No 1.0 release may be called
complete until every requirement below is **Implemented** and the complete
acceptance scenario passes on both Intel and Apple Silicon Macs.

### 1. Local project lifecycle — **Partial; not release-ready**

Required:

1. Create a named project and choose its project type, aspect ratio,
   resolution, and frame rate.
2. Import supported video, audio, and image files from local storage.
3. Close and reopen the app and recover the project, timeline, settings, and
   local media without silently losing edits.
4. Report an actionable error when a source is missing, corrupt, or unsupported.
5. Save safely: an interrupted save must not replace a valid prior project.

Evidence today: project creation and browser persistence use local storage plus
IndexedDB blobs; native state is written to app data with a temporary file and
rename, and native import copies media into app data. Reopen restoration and
error paths exist. However, this is not yet a proven 1.0 lifecycle acceptance
run across supported media and both desktop architectures. The UI’s
“Export JSON” is project metadata, not a finished-video export.

### 2. A-roll/B-roll organization — **Partial; not release-ready**

Required:

* Users can assign, change, filter, and visibly distinguish A-roll and B-roll.
* Organization survives save/reopen and is reflected in the edit workflow.
* Audio and still-image roles remain distinct from A-roll/B-roll.

Evidence today: imported video defaults to A-roll; the Inspector can reassign
video between A-roll and B-roll; the Library can filter both roles; and Library
cards and timeline clips visibly label their role. Roles are persisted in
project state and older projects receive kind-appropriate defaults. A complete
save/reopen acceptance run on both desktop architectures is still required.

### 3. Reversible rough cut (split and trim) — **Partial; not release-ready**

Required:

* Add, arrange, move, delete, split at the playhead, and trim clips.
* Undo and redo every destructive timeline operation, including after save and
  reopen.
* Reject invalid overlaps and out-of-source ranges without corrupting the
  timeline.

Evidence today: timeline placement, moving, deletion, overlap checks, trim
start, duration, volume, and mute are connected. Split-at-playhead is connected
in the Inspector, and Undo/Redo controls and keyboard shortcuts restore
project, asset, clip, role, overlay, adjustment, and track-mute mutations.
Split and overlap math have focused tests. History is session-only rather than
persisted across save/reopen, and the full desktop acceptance run is pending.

### 4. Accurate preview — **Partial; not release-ready**

Required:

* Preview the source and edited timeline with frame/time-accurate seeking.
* Honor clip trim, duration, position, track mute, clip volume, master volume,
  and mute.
* Keep playhead, displayed time, active media, and end-of-clip behavior
  synchronized; clearly report unsupported media and buffering.

Evidence today: `EditorPlayback` uses native HTML media events, clip trim
offsets, track/master volume, seeking, and buffering/error states. This is a
working preview path, but no repository evidence establishes the required
cross-format, long-file, image, audio-mix, and Intel/Apple Silicon acceptance
matrix. It cannot substitute for rendered-output verification.

### 5. Basic rendered color and audio — **Partial; desktop evidence pending**

Required:

* Apply basic exposure, contrast, and saturation to the rendered output.
* Mix clip and track audio, including volume and mute, into the rendered
  output.
* Verify that rendered pixels and audio differ as requested and remain
  synchronized.

Evidence today: the Tauri export command applies exposure/contrast/saturation
and clip/track mute/volume through FFmpeg filters. Browser preview remains
preview-only. Cross-architecture rendered-pixel/audio evidence is pending.

### 6. Static title and captions — **Partial; not release-ready**

Required:

* Add, edit, position, and persist a static title card/text overlay.
* Add, edit, time, and persist captions/subtitles.
* Show both in preview and burn or mux them into the finished export.

Evidence today: title and caption overlays have editable text, kind, start,
duration, and position; they persist in project state, participate in
undo/redo, and render at their timed position in timeline preview. There is no
finished-video renderer yet, so overlays cannot be burned or muxed into an
output and this requirement remains incomplete.

### 7. Playable finished-video export — **Partial; not release-ready**

Required:

* Render a complete timeline to a standard playable video with selected
  resolution, frame rate, color, audio, title, and captions.
* Fail clearly on unsupported inputs and never present a partial file as
  complete.
* Reopen the output in an independent player and verify duration, playback,
  picture, audio, and overlays.

Evidence today: desktop `Export MP4` invokes the bundled FFmpeg sidecar, uses
the native save dialog, validates the request, and atomically renames a partial
file after successful H.264/AAC rendering. Browser mode clearly limits export
to JSON. Independent-player and signed Mac acceptance evidence remain pending.

### 8. Signed/notarized Intel and Apple Silicon distribution — **Defined,
release evidence pending**

Required:

* Publish separate x86_64 (Intel) and aarch64 (Apple Silicon) macOS artifacts.
* Sign with Developer ID, notarize, staple, and verify Gatekeeper acceptance.
* Verify the installed binaries are the intended architecture and launch on
  the supported macOS floor.

Evidence today: the documented GitHub workflow builds both architectures and
describes signing, notarization, `codesign`, Gatekeeper, and `stapler`
verification. `DESKTOP.md` lists expected architecture-specific DMGs and
archives. This establishes a release procedure, not proof that a 1.0 artifact
has passed it; retain the CI logs and artifact checks for each release.

### 9. Updater safety — **Implemented as a release mechanism; product evidence
pending**

Required:

* Verify signed updater metadata before installation.
* Refuse malformed, unsigned, mismatched, or unverifiable updates.
* Preserve the installed app and user projects when download, verification, or
  installation fails.
* Keep updater private keys and Apple credentials out of the repository and
  logs, and verify updates on both architectures.

Evidence today: Tauri updater configuration, preflight key-pair checks,
credential-safe diagnostics, temporary-file cleanup, and metadata validation
scripts/tests are present and documented. A real published update rehearsal
with rollback/preservation evidence is still required before treating this as
1.0 complete.

### 10. Offline privacy — **Partial; not release-ready**

Required:

* Creating, importing, editing, previewing, saving, reopening, and exporting
  a finished video work with the network disabled.
* Raw media, project state, and creative content stay local by default.
* No telemetry, upload, or AI/cloud request occurs without explicit,
  separately explained consent.
* Offline failures are explicit and do not destroy local work.

Evidence today: editor media and state paths are local (IndexedDB/local
storage or Tauri app data), and no 1.0 render/export exists to test offline.
The repository does not yet provide a complete offline test proving the whole
workflow or a finished privacy/telemetry audit.

### Nour 1.0 end-to-end acceptance gate — **Not passed**

On a clean Intel Mac and a clean Apple Silicon Mac, with networking disabled:

1. Create a project; import one video, one audio file, and one image.
2. Reopen the app and confirm all three sources and settings are present.
3. Organize sources as A-roll/B-roll; add them to separate intended timeline
   positions; split, trim, move, undo, redo, and save.
4. Confirm preview time, clip boundaries, picture, and mixed audio at the
   beginning, a cut, and the end.
5. Add a title and captions; render the selected output settings.
6. Play the output in an independent player and verify picture, audio, title,
   captions, duration, and synchronization.
7. Install and launch the signed/notarized Intel and Apple Silicon artifacts,
   then apply a signed update. Simulate failed download/verification and
   confirm the prior app and project remain usable.
8. Record versions, OS/hardware, input fixtures, output checksums, and
   pass/fail results as release evidence.

The current repository cannot pass this gate because rendered color/audio,
burned or muxed title/captions, and finished-video export are absent. The new
organization, split, undo/redo, and text-overlay paths also still require the
complete desktop acceptance matrix above.

## Nour 2.0 — assisted, branded, optionally connected

2.0 starts only after the 1.0 gate passes. Every item below is a separate
opt-in capability; none is implied by the current editor or Console.

### Transcript and story automation — **Not implemented**

Required:

* Local or explicitly consented transcription with visible source, language,
  model, and processing location.
* Searchable, time-aligned transcript that can create/select story moments.
* Assisted story beats, selects, and rough-cut suggestions that are
  non-destructive, reviewable, attributable to their inputs, and undoable.
* No automated change may silently overwrite the user’s timeline or source.

Current status: no transcript, transcript storage, story automation, or
consent/processing flow is present.

### Advanced captions, motion, color, and audio — **Not implemented**

Required:

* Caption styling, speaker handling, timing correction, accessibility export,
  and burn-in/mux options.
* Keyframed motion, transitions, and title animation with accurate preview.
* Curves/LUT or equivalent advanced color controls with render parity.
* Audio cleanup, ducking, mixing, and loudness checks with render parity.
* All controls must be deterministic, reversible, persisted, and covered by
  rendered acceptance fixtures.

Current status: only basic preview-only color sliders and basic playback
volume/mute are present; no advanced or rendered system exists.

### AI Generate and privacy boundaries — **Not implemented**

Required:

* An explicit Generate action with a per-operation preview, inputs, model,
  destination, cost/network indication, and cancel path.
* Explicit consent before any media, transcript, prompt, or project metadata
  leaves the device; local-only mode must remain available.
* Provider retention/training terms, deletion behavior, failures, and
  generated-content provenance must be visible.
* Generated edits are suggestions or new assets, never silent destructive
  edits; users can reject, undo, and remove them.

Current status: no AI Generate capability, provider integration, privacy
boundary, or provenance model is present. Do not describe the sample project
or UI copy as AI.

### Brand Kit and Style DNA — **Not implemented**

Required:

* A local, versioned Brand Kit for fonts, colors, logos, safe areas, and export
  defaults with per-project overrides.
* A reviewable Style DNA profile derived only from explicitly selected
  references, with explainable controls and reset.
* Titles, captions, motion, color, and audio treatments must consume the
  selected version deterministically and render identically to preview.

Current status: no Brand Kit, Style DNA, asset model, or render integration is
present.

### Optional cloud and collaboration — **Not implemented**

Required only when the user opts in:

* Clear account/workspace consent, local-only fallback, and an offline queue.
* Authenticated project/media sharing with roles, invitations, revocation,
  encryption, audit history, conflict handling, and deletion/export controls.
* Never upload raw media or creative work by default; disclose exactly what is
  uploaded and for how long.

Current status: no connected collaboration or cloud project system is present.
The local editor and browser persistence must not be represented as cloud
collaboration.

### Real authenticated Console — **Not implemented**

Required:

* Server-backed authentication with secure sessions, logout, account/workspace
  authorization, and role-based access control.
* Real release, installation, user, communication, and analytics data behind
  authorized API calls, with audit logging and least-privilege operations.
* Privacy-safe, aggregate analytics that never collect creative media or
  project contents without separate consent.
* Explicit loading, empty, error, retry, and permission-denied states; no demo
  data in production views.

Current status: `src/App.tsx` provides a navigable local UI with hard-coded
sample users/metrics and labels it “Demo data / Local preview mode.” Buttons
produce local notifications such as “ready for the backend phase.” There is no
authenticated Console contract to release today.

## Release decision

The repository snapshot is **not a Nour 1.0 or Nour 2.0 release**. It is a
local editor/desktop foundation with a documented signed-release pipeline.
Only a future release that satisfies every 1.0 requirement and its
end-to-end gate may claim Nour 1.0. Nour 2.0 claims additionally require the
explicit privacy, consent, authentication, and rendered-output evidence above.