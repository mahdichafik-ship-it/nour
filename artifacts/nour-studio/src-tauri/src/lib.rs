use serde::Serialize;
use std::fs;
use tauri::Manager;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopInfo {
    platform: String,
    data_directory: String,
}

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![desktop_info, save_project])
        .run(tauri::generate_context!())
        .expect("error while running Nour Desktop");
}

#[cfg(test)]
mod tests {
    use super::safe_project_name;

    #[test]
    fn creates_safe_project_file_names() {
        assert_eq!(safe_project_name("Morocco, in motion"), "morocco--in-motion");
        assert_eq!(safe_project_name("  "), "nour-project");
    }
}