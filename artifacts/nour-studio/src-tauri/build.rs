use std::{fs, path::Path};

fn ensure_development_icon() {
    let icon_path = Path::new("icons/icon.png");
    if icon_path.exists() {
        return;
    }

    fs::create_dir_all("icons").expect("create Tauri icon directory");
    let file = fs::File::create(icon_path).expect("create development icon");
    let mut encoder = png::Encoder::new(file, 32, 32);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().expect("write icon header");
    let mut pixels = vec![0_u8; 32 * 32 * 4];

    for y in 0..32 {
        for x in 0..32 {
            let offset = (y * 32 + x) * 4;
            let is_mark = (6..10).contains(&x) && (15..27).contains(&y)
                || (14..18).contains(&x) && (8..27).contains(&y)
                || (22..26).contains(&x) && (12..27).contains(&y);
            let color = if is_mark {
                [231, 185, 121, 255]
            } else {
                [19, 23, 27, 255]
            };
            pixels[offset..offset + 4].copy_from_slice(&color);
        }
    }

    writer
        .write_image_data(&pixels)
        .expect("write development icon pixels");
}

fn main() {
    ensure_development_icon();
    tauri_build::build()
}