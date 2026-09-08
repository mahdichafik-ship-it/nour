use serde::Serialize;
use std::{
    fs,
    fs::{File, OpenOptions},
    io,
    path::Path,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;
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

#[derive(Default)]
struct EditorStateLock(Mutex<()>);

const MEDIA_EXTENSIONS: &[&str] = &[
    "mp4", "mov", "m4v", "webm", "mkv", "mp3", "m4a", "wav", "aac", "ogg", "flac", "png",
    "jpg", "jpeg", "webp", "gif",
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
            let destination = media_directory.join(format!("media-{timestamp}-{attempt}.{extension}"));
            let mut output = match OpenOptions::new().write(true).create_new(true).open(&destination) {
                Ok(file) => file,
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => return None,
                Err(error) => return Some(Err(format!("Could not create local media copy: {error}"))),
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

    let file_path = project_directory.join(format!(
        "{}.nourproject",
        safe_project_name(&project_name)
    ));
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
    let copied = tauri::async_runtime::spawn_blocking(move || -> Result<Vec<NativeMediaFile>, String> {
        fs::create_dir_all(&media_directory)
            .map_err(|error| format!("Could not create media directory: {error}"))?;
        selected_files
            .iter()
            .map(|file| {
                let path = file
                    .as_path()
                    .ok_or_else(|| "Selected media path is not available locally".to_string())?;
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
    let directory = app.path().app_data_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| format!("Could not create app data directory: {error}"))?;
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(EditorStateLock::default())
        .invoke_handler(tauri::generate_handler![
            desktop_info,
            save_project,
            import_media,
            save_editor_state,
            load_editor_state
        ])
        .run(tauri::generate_context!())
        .expect("error while running Nour Desktop");
}

#[cfg(test)]
mod tests {
    use super::{media_extension, safe_project_name, source_file_name};
    use std::path::Path;

    #[test]
    fn creates_safe_project_file_names() {
        assert_eq!(safe_project_name("Morocco, in motion"), "morocco--in-motion");
        assert_eq!(safe_project_name("  "), "nour-project");
    }

    #[test]
    fn accepts_only_supported_media_extensions() {
        assert_eq!(media_extension(Path::new("clip.MP4")), Some("mp4".to_string()));
        assert_eq!(media_extension(Path::new("notes.txt")), None);
    }

    #[test]
    fn does_not_turn_a_path_into_a_media_name() {
        assert_eq!(
            source_file_name(Path::new("/private/footage/scene.mov")).unwrap(),
            "scene.mov"
        );
    }
}