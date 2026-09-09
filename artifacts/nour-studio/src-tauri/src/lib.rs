use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    fs::{File, OpenOptions},
    io,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_shell::ShellExt;

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

fn ffmpeg_filter_path(path: &Path) -> String {
    path.to_string_lossy()
        .replace('\\', "\\\\")
        .replace(':', "\\:")
        .replace('\'', "\\'")
}

fn temporary_export_path(output: &Path) -> PathBuf {
    let name = output
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("nour-export.mp4");
    output.with_file_name(format!(".{name}.partial.mp4"))
}

#[derive(Debug)]
struct RenderPlan {
    filter_graph: String,
    args: Vec<String>,
    timeline_duration: f64,
}

fn build_render_plan(
    request: &ExportRequest,
    audio_input_indices: &HashSet<usize>,
    overlay_text_paths: &[PathBuf],
    temporary: &Path,
) -> Result<RenderPlan, String> {
    if overlay_text_paths.len() != request.overlays.len() {
        return Err("Text overlay files could not be prepared.".into());
    }
    let (width, height) = request
        .resolution
        .split_once('x')
        .ok_or_else(|| "Export resolution is invalid.".to_string())?;
    let timeline_duration = request
        .clips
        .iter()
        .map(|clip| clip.start + clip.duration)
        .fold(0.0, f64::max);
    let mut args = vec![
        "-y".into(),
        "-loglevel".into(),
        "error".into(),
        "-nostats".into(),
    ];
    let mut video_clips = Vec::new();
    let mut audio_clips = Vec::new();

    for (input_index, clip) in request.clips.iter().enumerate() {
        let asset = request
            .assets
            .iter()
            .find(|asset| asset.id == clip.asset_id)
            .ok_or_else(|| "A timeline clip refers to a missing media asset.".to_string())?;
        let path = asset
            .native_path
            .as_deref()
            .ok_or_else(|| format!("Media asset {} is not available on disk.", asset.id))?;
        if asset.kind == "image" {
            args.extend(["-loop".into(), "1".into()]);
        }
        args.extend(["-i".into(), path.into()]);
        if clip.track == "video" {
            video_clips.push((input_index, clip, asset));
        }
        if audio_input_indices.contains(&input_index) {
            audio_clips.push((input_index, clip));
        }
    }
    if video_clips.is_empty() {
        return Err("A video or image clip is required for MP4 export.".into());
    }

    let mut graph = format!(
        "color=c=black:s={width}x{height}:r={}:d={timeline_duration}[base];",
        request.frame_rate
    );
    let mut current_video = "base".to_string();
    for (index, (input, clip, asset)) in video_clips.iter().enumerate() {
        let adjustments = asset.adjustments.as_ref();
        let exposure = adjustments.map(|value| value.exposure).unwrap_or(1.0);
        let contrast = adjustments.map(|value| value.contrast).unwrap_or(1.0);
        let saturation = adjustments.map(|value| value.saturation).unwrap_or(1.0);
        let clip_label = format!("v{index}");
        let next_label = format!("vg{index}");
        graph.push_str(&format!(
            "[{input}:v]trim=start={}:duration={},setpts=PTS-STARTPTS+{}/TB,scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,eq=brightness={}:contrast={}:saturation={}[{clip_label}];[{current_video}][{clip_label}]overlay=shortest=0:eof_action=pass:enable='between(t,{},{})'[{next_label}];",
            clip.trim_start,
            clip.duration,
            clip.start,
            (exposure - 1.0) * 0.5,
            contrast,
            saturation,
            clip.start,
            clip.start + clip.duration
        ));
        current_video = next_label;
    }
    for (index, (overlay, text_path)) in request.overlays.iter().zip(overlay_text_paths).enumerate()
    {
        let position = match overlay.position.as_str() {
            "top" => "x=(w-text_w)/2:y=h*0.09",
            "center" => "x=(w-text_w)/2:y=(h-text_h)/2",
            _ => "x=(w-text_w)/2:y=h*0.86",
        };
        let next_label = format!("text{index}");
        graph.push_str(&format!(
            "[{current_video}]drawtext=textfile='{}':reload=0:expansion=none:fontsize=h/18:fontcolor=white:borderw=3:bordercolor=black:{position}:enable='between(t,{},{})'[{next_label}];",
            ffmpeg_filter_path(text_path),
            overlay.start,
            overlay.start + overlay.duration
        ));
        current_video = next_label;
    }
    graph.push_str(&format!("[{current_video}]null[video_out];"));

    if audio_clips.is_empty() {
        let silent_input = request.clips.len();
        args.extend([
            "-f".into(),
            "lavfi".into(),
            "-i".into(),
            "anullsrc=channel_layout=stereo:sample_rate=48000".into(),
        ]);
        graph.push_str(&format!(
            "[{silent_input}:a]atrim=duration={timeline_duration},asetpts=PTS-STARTPTS[audio_out]"
        ));
    } else {
        for (index, (input, clip)) in audio_clips.iter().enumerate() {
            graph.push_str(&format!(
                "[{input}:a]atrim=start={}:duration={},asetpts=PTS-STARTPTS,adelay={}ms:all=1,volume={}[a{index}];",
                clip.trim_start,
                clip.duration,
                (clip.start * 1000.0).round() as u64,
                clip.volume
            ));
        }
        let inputs = (0..audio_clips.len())
            .map(|index| format!("[a{index}]"))
            .collect::<String>();
        graph.push_str(&format!(
            "{inputs}amix=inputs={}:duration=longest:dropout_transition=0,apad=whole_dur={timeline_duration}[audio_out]",
            audio_clips.len()
        ));
    }
    args.extend([
        "-filter_complex".into(),
        graph.clone(),
        "-map".into(),
        "[video_out]".into(),
        "-map".into(),
        "[audio_out]".into(),
        "-c:v".into(),
        "libx264".into(),
        "-pix_fmt".into(),
        "yuv420p".into(),
        "-r".into(),
        request.frame_rate.to_string(),
        "-c:a".into(),
        "aac".into(),
        "-movflags".into(),
        "+faststart".into(),
        "-t".into(),
        timeline_duration.to_string(),
        "-f".into(),
        "mp4".into(),
        temporary.to_string_lossy().into_owned(),
    ]);
    Ok(RenderPlan {
        filter_graph: graph,
        args,
        timeline_duration,
    })
}

#[tauri::command]
async fn export_video(app: tauri::AppHandle, request: String) -> Result<String, String> {
    let request: ExportRequest =
        serde_json::from_str(&request).map_err(|e| format!("Invalid export request: {e}"))?;
    validate_export(&request)?;
    let output = app
        .dialog()
        .file()
        .set_file_name(format!("{}.mp4", safe_project_name(&request.project_name)))
        .add_filter("MP4 video", &["mp4"])
        .blocking_save_file()
        .ok_or_else(|| "Export cancelled.".to_string())?;
    let mut output = output
        .as_path()
        .ok_or_else(|| "The selected export path is unavailable.".to_string())?
        .to_path_buf();
    if output.extension().and_then(|value| value.to_str()) != Some("mp4") {
        output.set_extension("mp4");
    }
    let parent = output
        .parent()
        .ok_or_else(|| "The selected export path has no parent directory.".to_string())?;
    if !parent.is_dir() {
        return Err("The selected export directory is unavailable.".into());
    }
    let output_absolute = parent
        .canonicalize()
        .map_err(|_| "The selected export directory is unavailable.".to_string())?
        .join(output.file_name().unwrap_or_default());
    for asset in &request.assets {
        if let Some(path) = &asset.native_path {
            if Path::new(path).canonicalize().ok().as_ref() == Some(&output_absolute) {
                return Err("The export cannot overwrite source media.".into());
            }
        }
    }
    let temporary = temporary_export_path(&output);
    let _ = fs::remove_file(&temporary);
    let overlay_prefix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "System clock is unavailable.".to_string())?
        .as_nanos();
    let overlay_text_paths = request
        .overlays
        .iter()
        .enumerate()
        .map(|(index, overlay)| {
            let path = std::env::temp_dir().join(format!(
                "nour-overlay-{}-{overlay_prefix}-{index}.txt",
                std::process::id()
            ));
            fs::write(&path, &overlay.text)
                .map_err(|_| "Could not prepare title or caption text.".to_string())?;
            Ok(path)
        })
        .collect::<Result<Vec<_>, String>>()?;
    let mut audio_input_indices = HashSet::new();
    for (input_index, clip) in request.clips.iter().enumerate() {
        let asset = request
            .assets
            .iter()
            .find(|a| a.id == clip.asset_id)
            .unwrap();
        let track_is_muted = (clip.track == "video" && request.track_muted.video)
            || (clip.track == "audio" && request.track_muted.audio);
        if clip.muted || clip.volume == 0.0 || track_is_muted || asset.kind == "image" {
            continue;
        }
        if asset.kind == "audio" {
            audio_input_indices.insert(input_index);
            continue;
        }
        let probe = app
            .shell()
            .sidecar("binaries/ffprobe")
            .map_err(|error| format!("Bundled FFprobe is unavailable: {error}"))?
            .args([
                "-v",
                "error",
                "-select_streams",
                "a:0",
                "-show_entries",
                "stream=index",
                "-of",
                "csv=p=0",
                asset.native_path.as_deref().unwrap_or_default(),
            ])
            .output()
            .await
            .map_err(|error| format!("Could not inspect media audio: {error}"))?;
        if probe.status.success() && !probe.stdout.is_empty() {
            audio_input_indices.insert(input_index);
        }
    }
    let plan = build_render_plan(
        &request,
        &audio_input_indices,
        &overlay_text_paths,
        &temporary,
    )?;
    let _ = (&plan.filter_graph, plan.timeline_duration);
    let result = app
        .shell()
        .sidecar("binaries/ffmpeg")
        .map_err(|error| format!("Bundled FFmpeg is unavailable: {error}"))?
        .args(plan.args)
        .output()
        .await
        .map_err(|error| format!("Could not start bundled FFmpeg: {error}"))?;
    for path in &overlay_text_paths {
        let _ = fs::remove_file(path);
    }
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
    if let Err(error) = fs::rename(&temporary, &output) {
        let _ = fs::remove_file(&temporary);
        return Err(format!("Could not finalize the rendered video: {error}"));
    }
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
        build_render_plan, ffmpeg_filter_path, media_extension, safe_project_name,
        source_file_name, temporary_export_path, validate_export, Adjustments, ExportAsset,
        ExportClip, ExportOverlay, ExportRequest, TrackMuted,
    };
    use std::{
        collections::HashSet,
        fs,
        path::Path,
        process::Command,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn ffmpeg_test_binary() -> String {
        std::env::var("NOUR_FFMPEG_TEST_BINARY").unwrap_or_else(|_| "ffmpeg".into())
    }

    fn ffprobe_test_binary() -> String {
        std::env::var("NOUR_FFPROBE_TEST_BINARY").unwrap_or_else(|_| "ffprobe".into())
    }

    fn render_request(paths: [&str; 3]) -> ExportRequest {
        ExportRequest {
            project_name: "test".into(),
            resolution: "1280x720".into(),
            frame_rate: 24,
            assets: vec![
                ExportAsset {
                    id: "interview".into(),
                    kind: "video".into(),
                    native_path: Some(paths[0].into()),
                    duration: 2.0,
                    adjustments: Some(Adjustments {
                        exposure: 1.1,
                        contrast: 1.2,
                        saturation: 0.9,
                    }),
                },
                ExportAsset {
                    id: "music".into(),
                    kind: "audio".into(),
                    native_path: Some(paths[1].into()),
                    duration: 2.0,
                    adjustments: None,
                },
                ExportAsset {
                    id: "silent".into(),
                    kind: "video".into(),
                    native_path: Some(paths[2].into()),
                    duration: 2.0,
                    adjustments: None,
                },
            ],
            clips: vec![
                ExportClip {
                    asset_id: "interview".into(),
                    track: "video".into(),
                    start: 1.0,
                    trim_start: 0.25,
                    duration: 1.0,
                    volume: 0.8,
                    muted: false,
                },
                ExportClip {
                    asset_id: "music".into(),
                    track: "audio".into(),
                    start: 2.0,
                    trim_start: 0.0,
                    duration: 1.0,
                    volume: 0.5,
                    muted: false,
                },
                ExportClip {
                    asset_id: "silent".into(),
                    track: "video".into(),
                    start: 4.0,
                    trim_start: 0.0,
                    duration: 1.0,
                    volume: 1.0,
                    muted: false,
                },
            ],
            overlays: vec![
                ExportOverlay {
                    text: "Nour: creator's cut".into(),
                    start: 1.0,
                    duration: 1.0,
                    position: "top".into(),
                },
                ExportOverlay {
                    text: "Second line".into(),
                    start: 4.0,
                    duration: 0.5,
                    position: "bottom".into(),
                },
            ],
            track_muted: TrackMuted {
                video: false,
                audio: false,
            },
        }
    }

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

    #[test]
    fn render_plan_preserves_timeline_audio_and_overlay_semantics() {
        let request = render_request(["/tmp/interview.mp4", "/tmp/music.wav", "/tmp/silent.mp4"]);
        let audio_inputs = HashSet::from([0, 1]);
        let output = Path::new("/tmp/.nour-test.partial.mp4");
        let text_paths = vec![
            Path::new("/tmp/nour-title.txt").to_path_buf(),
            Path::new("/tmp/nour-caption.txt").to_path_buf(),
        ];
        let plan = build_render_plan(&request, &audio_inputs, &text_paths, output).unwrap();

        assert_eq!(plan.timeline_duration, 5.0);
        assert!(plan.filter_graph.contains("d=5[base]"));
        assert!(plan
            .filter_graph
            .contains("[0:v]trim=start=0.25:duration=1"));
        assert!(plan.filter_graph.contains("PTS-STARTPTS+1/TB"));
        assert!(plan.filter_graph.contains("[base][v0]overlay"));
        assert!(plan.filter_graph.contains("[vg0][v1]overlay"));
        assert!(plan
            .filter_graph
            .contains("[0:a]atrim=start=0.25:duration=1"));
        assert!(plan.filter_graph.contains("adelay=1000ms:all=1,volume=0.8"));
        assert!(plan.filter_graph.contains("[1:a]atrim=start=0:duration=1"));
        assert!(plan.filter_graph.contains("adelay=2000ms:all=1,volume=0.5"));
        assert!(plan.filter_graph.contains("[text0]drawtext"));
        assert!(plan.filter_graph.contains("[text1]null[video_out]"));
        assert!(plan.filter_graph.contains("textfile='/tmp/nour-title.txt'"));
        assert_eq!(plan.args.last().unwrap(), "/tmp/.nour-test.partial.mp4");
        let inputs = plan
            .args
            .windows(2)
            .filter(|pair| pair[0] == "-i")
            .map(|pair| pair[1].as_str())
            .collect::<Vec<_>>();
        assert_eq!(
            inputs,
            vec!["/tmp/interview.mp4", "/tmp/music.wav", "/tmp/silent.mp4"]
        );
    }

    #[test]
    fn muted_tracks_can_fall_back_to_timeline_length_silence() {
        let request = render_request(["video.mp4", "music.wav", "silent.mp4"]);
        let text_paths = vec![
            Path::new("title.txt").to_path_buf(),
            Path::new("caption.txt").to_path_buf(),
        ];
        let plan = build_render_plan(
            &request,
            &HashSet::new(),
            &text_paths,
            Path::new("out.partial.mp4"),
        )
        .unwrap();
        assert!(plan
            .filter_graph
            .contains("[3:a]atrim=duration=5,asetpts=PTS-STARTPTS[audio_out]"));
        assert!(plan
            .args
            .iter()
            .any(|argument| argument == "anullsrc=channel_layout=stereo:sample_rate=48000"));
        assert!(
            temporary_export_path(Path::new("/tmp/movie.mp4")).ends_with(".movie.mp4.partial.mp4")
        );
    }

    #[test]
    fn overlay_text_files_escape_filter_path_characters() {
        assert_eq!(
            ffmpeg_filter_path(Path::new("/tmp/Nour: creator's cut.txt")),
            "/tmp/Nour\\: creator\\'s cut.txt"
        );
    }

    #[test]
    fn generated_media_renders_to_a_playable_mp4() {
        let ffmpeg = ffmpeg_test_binary();
        let ffprobe = ffprobe_test_binary();
        if Command::new(&ffmpeg).arg("-version").output().is_err()
            || Command::new(&ffprobe).arg("-version").output().is_err()
        {
            return;
        }
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("nour-render-{unique}"));
        fs::create_dir_all(&directory).unwrap();
        let interview = directory.join("interview.mp4");
        let music = directory.join("music.wav");
        let silent = directory.join("silent.mp4");
        let output = directory.join("output.partial.mp4");
        let title = directory.join("title.txt");
        let caption = directory.join("caption.txt");
        fs::write(&title, "Nour: creator's cut").unwrap();
        fs::write(&caption, "Second line").unwrap();

        let generated = [
            Command::new(&ffmpeg)
                .args([
                    "-y",
                    "-loglevel",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    "color=c=blue:s=320x180:r=24:d=2",
                    "-f",
                    "lavfi",
                    "-i",
                    "sine=frequency=440:duration=2",
                    "-shortest",
                    "-c:v",
                    "libx264",
                    "-pix_fmt",
                    "yuv420p",
                    "-c:a",
                    "aac",
                ])
                .arg(&interview)
                .status()
                .unwrap(),
            Command::new(&ffmpeg)
                .args([
                    "-y",
                    "-loglevel",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    "sine=frequency=660:duration=2",
                ])
                .arg(&music)
                .status()
                .unwrap(),
            Command::new(&ffmpeg)
                .args([
                    "-y",
                    "-loglevel",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    "color=c=red:s=320x180:r=24:d=2",
                    "-c:v",
                    "libx264",
                    "-pix_fmt",
                    "yuv420p",
                ])
                .arg(&silent)
                .status()
                .unwrap(),
        ];
        assert!(generated.iter().all(|status| status.success()));

        let request = render_request([
            interview.to_str().unwrap(),
            music.to_str().unwrap(),
            silent.to_str().unwrap(),
        ]);
        let plan = build_render_plan(&request, &HashSet::from([0, 1]), &[title, caption], &output)
            .unwrap();
        let status = Command::new(&ffmpeg).args(&plan.args).status().unwrap();
        assert!(status.success());
        assert!(output.metadata().unwrap().len() > 0);

        let probe = Command::new(&ffprobe)
            .args([
                "-v",
                "error",
                "-show_entries",
                "stream=codec_type",
                "-of",
                "csv=p=0",
            ])
            .arg(&output)
            .output()
            .unwrap();
        let streams = String::from_utf8_lossy(&probe.stdout);
        assert!(probe.status.success());
        assert!(streams.contains("video"));
        assert!(streams.contains("audio"));
        let _ = fs::remove_dir_all(directory);
    }
}
