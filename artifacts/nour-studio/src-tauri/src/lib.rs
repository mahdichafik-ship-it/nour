use serde::{Deserialize, Serialize};
use std::{
    fs,
    fs::{File, OpenOptions},
    io,
    path::Path,
    process::Command,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{path::BaseDirectory, Manager};
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopInfo {
    platform: String,
    data_directory: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeMediaFile {
    path: String,
    name: String,
    size: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportRequest {
    project_name: String,
    resolution: String,
    frame_rate: u32,
    assets: Vec<ExportAsset>,
    clips: Vec<ExportClip>,
    overlays: Vec<ExportOverlay>,
    track_muted: TrackMuted,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportAsset {
    id: String,
    kind: String,
    native_path: Option<String>,
    duration: f64,
    adjustments: Option<Adjustments>,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportClip {
    asset_id: String,
    track: String,
    start: f64,
    trim_start: f64,
    duration: f64,
    volume: f64,
    muted: bool,
}
#[derive(Debug, Deserialize)]
struct ExportOverlay {
    text: String,
    start: f64,
    duration: f64,
    position: String,
}
#[derive(Debug, Deserialize)]
struct TrackMuted {
    video: bool,
    audio: bool,
}
#[derive(Debug, Deserialize)]
struct Adjustments {
    exposure: f64,
    contrast: f64,
    saturation: f64,
}

fn validate_export(request: &ExportRequest) -> Result<(), String> {
    if ![
        "3840x2160",
        "1920x1080",
        "1080x1920",
        "1080x1080",
        "1280x720",
    ]
    .contains(&request.resolution.as_str())
    {
        return Err("Unsupported export resolution.".into());
    }
    if ![24, 25, 30, 60].contains(&request.frame_rate) {
        return Err("Unsupported export frame rate.".into());
    }
    if request.clips.is_empty() {
        return Err("Add at least one clip before exporting.".into());
    }
    let ids: std::collections::HashSet<_> = request.assets.iter().map(|a| a.id.as_str()).collect();
    for asset in &request.assets {
        if !["video", "audio", "image"].contains(&asset.kind.as_str())
            || asset.duration <= 0.0
            || !asset.duration.is_finite()
        {
            return Err("Export contains an invalid media asset.".into());
        }
        let path = asset
            .native_path
            .as_deref()
            .ok_or_else(|| format!("Media asset {} is not available on disk.", asset.id))?;
        if !Path::new(path).is_file() {
            return Err(format!("Media file is missing: {}", asset.id));
        }
        if let Some(a) = &asset.adjustments {
            if [a.exposure, a.contrast, a.saturation]
                .iter()
                .any(|v| !v.is_finite() || *v < 0.0 || *v > 2.0)
            {
                return Err("Color adjustments must be between 0 and 2.".into());
            }
        }
    }
    for clip in &request.clips {
        if !ids.contains(clip.asset_id.as_str()) {
            return Err("A timeline clip refers to a missing media asset.".into());
        }
        let asset = request
            .assets
            .iter()
            .find(|a| a.id == clip.asset_id)
            .unwrap();
        if !clip.duration.is_finite()
            || !clip.trim_start.is_finite()
            || !clip.start.is_finite()
            || clip.duration <= 0.0
            || clip.trim_start < 0.0
            || clip.start < 0.0
            || clip.trim_start + clip.duration > asset.duration + 0.05
            || !(0.0..=1.0).contains(&clip.volume)
        {
            return Err("Timeline clips must have positive, non-negative timing.".into());
        }
        if clip.track != "video" && clip.track != "audio" {
            return Err("Timeline contains an unknown track.".into());
        }
        if (clip.track == "audio" && asset.kind != "audio")
            || (clip.track == "video" && asset.kind == "audio")
        {
            return Err("Timeline clip kind does not match its track.".into());
        }
    }
    for overlay in &request.overlays {
        if !overlay.start.is_finite()
            || !overlay.duration.is_finite()
            || overlay.start < 0.0
            || overlay.duration <= 0.0
            || !["top", "center", "bottom"].contains(&overlay.position.as_str())
        {
            return Err("Overlay timing or position is invalid.".into());
        }
    }
    Ok(())
}

fn ffmpeg_filter_text(text: &str) -> String {
    text.replace('\\', "\\\\")
        .replace(':', "\\:")
        .replace('\'', "\\'")
        .replace('\n', "\\n")
}

fn bundled_ffmpeg_name() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        #[cfg(target_arch = "aarch64")]
        {
            return "binaries/ffmpeg-aarch64-apple-darwin";
        }
        #[cfg(target_arch = "x86_64")]
        {
            return "binaries/ffmpeg-x86_64-apple-darwin";
        }
    }
    #[cfg(target_os = "linux")]
    {
        return "binaries/ffmpeg-x86_64-unknown-linux-gnu";
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        "binaries/ffmpeg"
    }
}

fn bundled_ffprobe_name() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        #[cfg(target_arch = "aarch64")]
        {
            return "binaries/ffprobe-aarch64-apple-darwin";
        }
        #[cfg(target_arch = "x86_64")]
        {
            return "binaries/ffprobe-x86_64-apple-darwin";
        }
    }
    #[cfg(target_os = "linux")]
    {
        return "binaries/ffprobe-x86_64-unknown-linux-gnu";
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        "binaries/ffprobe"
    }
}

#[tauri::command]
fn export_video(app: tauri::AppHandle, request: String) -> Result<String, String> {
    let request: ExportRequest =
        serde_json::from_str(&request).map_err(|e| format!("Invalid export request: {e}"))?;
    validate_export(&request)?;
    let _project_name = &request.project_name;
    let output = app
        .dialog()
        .file()
        .add_filter("MP4 video", &["mp4"])
        .blocking_save_file()
        .ok_or_else(|| "Export cancelled.".to_string())?;
    let output = output
        .as_path()
        .ok_or_else(|| "The selected export path is unavailable.".to_string())?
        .to_path_buf();
    let parent = output
        .parent()
        .ok_or_else(|| "The selected export path has no parent directory.".to_string())?;
    let stem = output
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("nour-export.mp4");
    let temporary = parent.join(format!(".{stem}.partial.mp4"));
    let ffmpeg = app
        .path()
        .resolve(bundled_ffmpeg_name(), BaseDirectory::Resource)
        .map_err(|e| format!("Bundled FFmpeg is unavailable: {e}"))?;
    let mut command = Command::new(ffmpeg);
    command.args(["-y", "-loglevel", "error", "-nostats"]);
    let mut video_clips = Vec::new();
    let mut audio_clips = Vec::new();
    for (input_index, clip) in request.clips.iter().enumerate() {
        let asset = request
            .assets
            .iter()
            .find(|a| a.id == clip.asset_id)
            .unwrap();
        let path = asset
            .native_path
            .as_deref()
            .ok_or_else(|| format!("Media asset {} is not available on disk.", asset.id))?;
        if asset.kind == "image" {
            command.args(["-loop", "1"]);
        }
        command.args(["-i", path]);
        if clip.track == "video" {
            video_clips.push((input_index, clip, asset));
            // Video clips may carry production audio. Probe rather than assuming
            // one exists so silent video and still images remain valid.
            if asset.kind == "video" {
                let probe = app
                    .path()
                    .resolve(bundled_ffprobe_name(), BaseDirectory::Resource)
                    .map_err(|e| format!("Bundled FFprobe is unavailable: {e}"))?;
                let has_audio = Command::new(probe)
                    .args([
                        "-v",
                        "error",
                        "-select_streams",
                        "a:0",
                        "-show_entries",
                        "stream=index",
                        "-of",
                        "csv=p=0",
                        asset.native_path.as_deref().unwrap(),
                    ])
                    .output()
                    .map(|o| o.status.success() && !o.stdout.is_empty())
                    .unwrap_or(false);
                if has_audio {
                    audio_clips.push((input_index, clip, asset));
                }
            }
        } else {
            audio_clips.push((input_index, clip, asset));
        }
    }
    if video_clips.is_empty() {
        return Err("A video or image clip is required for MP4 export.".into());
    }
    let (width, height) = request.resolution.split_once('x').unwrap();
    let timeline_duration = request
        .clips
        .iter()
        .map(|c| c.start + c.duration)
        .fold(0.0, f64::max);
    let mut graph = format!(
        "color=c=black:s={width}x{height}:r={}[base];",
        request.frame_rate
    );
    let mut current = "base".to_string();
    for (i, (input, clip, asset)) in video_clips.iter().enumerate() {
        let adj = asset.adjustments.as_ref();
        let exposure = adj.map(|a| a.exposure).unwrap_or(1.0);
        let contrast = adj.map(|a| a.contrast).unwrap_or(1.0);
        let saturation = adj.map(|a| a.saturation).unwrap_or(1.0);
        let next = format!("vg{i}");
        graph.push_str(&format!("[{input}:v]trim=start={}:duration={},setpts=PTS-STARTPTS+{}/TB,scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,eq=brightness={}:contrast={}:saturation={}[v{i}];[{current}][v{i}]overlay=shortest=0:eof_action=pass:enable='between(t,{}, {})'[{next}];", clip.trim_start, clip.duration, clip.start, (exposure - 1.0) * 0.5, contrast, saturation, clip.start, clip.start + clip.duration));
        current = next;
    }
    graph.push_str(&format!("[{current}]null[vout];"));
    if !request.overlays.is_empty() {
        let mut overlay_input = "vout".to_string();
        for (i, overlay) in request.overlays.iter().enumerate() {
            let position = match overlay.position.as_str() {
                "top" => "x=(w-text_w)/2:y=h*0.09",
                "center" => "x=(w-text_w)/2:y=(h-text_h)/2",
                _ => "x=(w-text_w)/2:y=h*0.86",
            };
            let next = format!("vo{i}");
            graph.push_str(&format!("[{}]drawtext=text='{}':fontsize=h/18:fontcolor=white:borderw=3:bordercolor=black:{position}:enable='between(t,{},{})'[{next}];", overlay_input, ffmpeg_filter_text(&overlay.text), overlay.start, overlay.start + overlay.duration));
            overlay_input = next;
        }
        graph.push_str(&format!("[{overlay_input}]overlayout"));
    }
    let map_video = if request.overlays.is_empty() {
        "[vout]"
    } else {
        "[overlayout]"
    };
    let audio_map;
    if audio_clips.is_empty() {
        command.args([
            "-f",
            "lavfi",
            "-i",
            "anullsrc=channel_layout=stereo:sample_rate=48000",
            "-shortest",
        ]);
        audio_map = Some("[silent]");
        graph.push_str(&format!(";[{}:a]anull[silent]", request.clips.len()));
    } else {
        let mut audio_graph = String::new();
        for (i, (input, clip, _)) in audio_clips.iter().enumerate() {
            audio_graph.push_str(&format!(
                "[{input}:a]atrim=start={}:duration={},asetpts=PTS-STARTPTS,adelay={}ms:all=1,volume={}[a{i}];",
                clip.trim_start,
                clip.duration,
                (clip.start * 1000.0) as u64,
                if clip.muted || (clip.track == "video" && request.track_muted.video) || (clip.track == "audio" && request.track_muted.audio) { 0.0 } else { clip.volume }
            ));
        }
        let inputs: String = (0..audio_clips.len()).map(|i| format!("[a{i}]")).collect();
        audio_graph.push_str(&format!(
            "{inputs}amix=inputs={}:duration=longest:dropout_transition=0[aout]",
            audio_clips.len()
        ));
        graph.push(';');
        graph.push_str(&audio_graph);
        audio_map = Some("[aout]");
    }
    command.args(["-filter_complex", &graph, "-map", map_video]);
    if let Some(map) = audio_map {
        command.args(["-map", map]);
    }
    command.args([
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-r",
        &request.frame_rate.to_string(),
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        "-t",
        &timeline_duration.to_string(),
        "-f",
        "mp4",
        temporary.to_str().unwrap(),
    ]);
    let result = command
        .output()
        .map_err(|e| format!("Could not start bundled FFmpeg: {e}"))?;
    if !result.status.success() {
        let _ = fs::remove_file(&temporary);
        return Err(format!(
            "FFmpeg could not render the video: {}",
            String::from_utf8_lossy(&result.stderr)
                .trim()
                .chars()
                .take(500)
                .collect::<String>()
        ));
    }
    fs::rename(&temporary, &output)
        .map_err(|e| format!("Could not finalize the rendered video: {e}"))?;
    Ok(output.display().to_string())
}

#[derive(Default)]
struct EditorStateLock(Mutex<()>);

const MEDIA_EXTENSIONS: &[&str] = &[
    "mp4", "mov", "m4v", "webm", "mkv", "mp3", "m4a", "wav", "aac", "ogg", "flac", "png", "jpg",
    "jpeg", "webp", "gif",
];

fn safe_project_name(project_name: &str) -> String {
    let name = project_name
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();
    let trimmed = name.trim_matches('-');
    if trimmed.is_empty() {
        "nour-project".to_string()
    } else {
        trimmed.to_lowercase()
    }
}

fn media_extension(path: &Path) -> Option<String> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    MEDIA_EXTENSIONS
        .contains(&extension.as_str())
        .then_some(extension)
}

fn source_file_name(path: &Path) -> Result<String, String> {
    path.file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| "Selected media file has no valid file name".to_string())
}

fn copy_media_file(source: &Path, media_directory: &Path) -> Result<NativeMediaFile, String> {
    let extension = media_extension(source).ok_or_else(|| {
        "Selected file is not a supported video, audio, or image format".to_string()
    })?;
    let name = source_file_name(source)?;
    let size = fs::metadata(source)
        .map_err(|error| format!("Could not inspect {}: {error}", source.display()))?
        .len();

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();
    let destination = (0..1000_u32)
        .find_map(|attempt| {
            let destination =
                media_directory.join(format!("media-{timestamp}-{attempt}.{extension}"));
            let mut output = match OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&destination)
            {
                Ok(file) => file,
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => return None,
                Err(error) => {
                    return Some(Err(format!("Could not create local media copy: {error}")))
                }
            };
            let result = (|| -> Result<(), String> {
                let mut input = File::open(source)
                    .map_err(|error| format!("Could not open {}: {error}", source.display()))?;
                io::copy(&mut input, &mut output)
                    .map_err(|error| format!("Could not copy {}: {error}", source.display()))?;
                output
                    .sync_all()
                    .map_err(|error| format!("Could not finalize local media copy: {error}"))
            })();
            match result {
                Ok(()) => Some(Ok(destination)),
                Err(error) => {
                    // This path was created exclusively by this invocation.
                    let _ = fs::remove_file(&destination);
                    Some(Err(error))
                }
            }
        })
        .transpose()?
        .ok_or_else(|| "Unable to allocate a unique local media file name".to_string())?;

    Ok(NativeMediaFile {
        path: destination.display().to_string(),
        name,
        size,
    })
}

#[tauri::command]
fn desktop_info(app: tauri::AppHandle) -> Result<DesktopInfo, String> {
    let data_directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    Ok(DesktopInfo {
        platform: std::env::consts::OS.to_string(),
        data_directory: data_directory.display().to_string(),
    })
}

#[tauri::command]
fn save_project(
    app: tauri::AppHandle,
    project_name: String,
    contents: String,
) -> Result<String, String> {
    let project_directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("projects");
    fs::create_dir_all(&project_directory).map_err(|error| error.to_string())?;

    let file_path =
        project_directory.join(format!("{}.nourproject", safe_project_name(&project_name)));
    fs::write(&file_path, contents).map_err(|error| error.to_string())?;
    Ok(file_path.display().to_string())
}

#[tauri::command]
async fn import_media(app: tauri::AppHandle) -> Result<Vec<NativeMediaFile>, String> {
    let picker_app = app.clone();
    let selected_files = tauri::async_runtime::spawn_blocking(move || {
        picker_app
            .dialog()
            .file()
            .add_filter("Media", MEDIA_EXTENSIONS)
            .blocking_pick_files()
    })
    .await
    .map_err(|error| format!("Media picker task failed: {error}"))?;

    let Some(selected_files) = selected_files else {
        return Ok(Vec::new());
    };

    let media_directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("media");
    let copied =
        tauri::async_runtime::spawn_blocking(move || -> Result<Vec<NativeMediaFile>, String> {
            fs::create_dir_all(&media_directory)
                .map_err(|error| format!("Could not create media directory: {error}"))?;
            selected_files
                .iter()
                .map(|file| {
                    let path = file.as_path().ok_or_else(|| {
                        "Selected media path is not available locally".to_string()
                    })?;
                    copy_media_file(path, &media_directory)
                })
                .collect()
        })
        .await
        .map_err(|error| format!("Media import task failed: {error}"))??;

    Ok(copied)
}

#[tauri::command]
fn save_editor_state(
    app: tauri::AppHandle,
    state_lock: tauri::State<'_, EditorStateLock>,
    contents: String,
) -> Result<(), String> {
    let _guard = state_lock
        .0
        .lock()
        .map_err(|_| "Editor state lock is unavailable".to_string())?;
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Could not create app data directory: {error}"))?;
    let state_path = directory.join("editor-state.json");
    let temporary_path = directory.join("editor-state.json.tmp");

    let mut temporary_file = File::create(&temporary_path)
        .map_err(|error| format!("Could not write editor state: {error}"))?;
    io::Write::write_all(&mut temporary_file, contents.as_bytes())
        .map_err(|error| format!("Could not write editor state: {error}"))?;
    temporary_file
        .sync_all()
        .map_err(|error| format!("Could not finalize editor state: {error}"))?;
    drop(temporary_file);
    if let Err(error) = fs::rename(&temporary_path, &state_path) {
        let _ = fs::remove_file(&temporary_path);
        return Err(format!("Could not save editor state: {error}"));
    }
    Ok(())
}

#[tauri::command]
fn load_editor_state(
    app: tauri::AppHandle,
    state_lock: tauri::State<'_, EditorStateLock>,
) -> Result<Option<String>, String> {
    let _guard = state_lock
        .0
        .lock()
        .map_err(|_| "Editor state lock is unavailable".to_string())?;
    let path = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("editor-state.json");
    match fs::read_to_string(path) {
        Ok(contents) => Ok(Some(contents)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("Could not load editor state: {error}")),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(EditorStateLock::default())
        .invoke_handler(tauri::generate_handler![
            desktop_info,
            save_project,
            import_media,
            save_editor_state,
            load_editor_state,
            export_video
        ])
        .run(tauri::generate_context!())
        .expect("error while running Nour Desktop");
}

#[cfg(test)]
mod tests {
    use super::{
        media_extension, safe_project_name, source_file_name, validate_export, ExportClip,
        ExportOverlay, ExportRequest, TrackMuted,
    };
    use std::path::Path;

    #[test]
    fn creates_safe_project_file_names() {
        assert_eq!(
            safe_project_name("Morocco, in motion"),
            "morocco--in-motion"
        );
        assert_eq!(safe_project_name("  "), "nour-project");
    }

    #[test]
    fn accepts_only_supported_media_extensions() {
        assert_eq!(
            media_extension(Path::new("clip.MP4")),
            Some("mp4".to_string())
        );
        assert_eq!(media_extension(Path::new("notes.txt")), None);
    }

    #[test]
    fn does_not_turn_a_path_into_a_media_name() {
        assert_eq!(
            source_file_name(Path::new("/private/footage/scene.mov")).unwrap(),
            "scene.mov"
        );
    }

    #[test]
    fn rejects_invalid_export_settings_and_missing_assets() {
        let request = ExportRequest {
            project_name: "test".into(),
            resolution: "999x999".into(),
            frame_rate: 30,
            assets: vec![],
            clips: vec![ExportClip {
                asset_id: "missing".into(),
                track: "video".into(),
                start: 0.0,
                trim_start: 0.0,
                duration: 1.0,
                volume: 1.0,
                muted: false,
            }],
            overlays: vec![ExportOverlay {
                text: "x".into(),
                start: 0.0,
                duration: 1.0,
                position: "top".into(),
            }],
            track_muted: TrackMuted {
                video: false,
                audio: false,
            },
        };
        assert!(validate_export(&request).is_err());
    }
}
