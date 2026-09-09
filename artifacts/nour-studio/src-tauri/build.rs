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
    // Tauri embeds PNG bytes without reducing 16-bit channels. Reject these
    // at build time rather than aborting when the native window is created.
    for path in [
        "icons/icon.png",
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/128x128@2x.png",
    ] {
        println!("cargo:rerun-if-changed={path}");
        let file = fs::File::open(path).expect("open app icon");
        let decoder = png::Decoder::new(file);
        let mut reader = decoder.read_info().expect("decode app icon header");
        let mut pixels = vec![0; reader.output_buffer_size()];
        let info = reader
            .next_frame(&mut pixels)
            .expect("decode app icon pixels");
        assert!(
            info.color_type == png::ColorType::Rgba
                && info.bit_depth == png::BitDepth::Eight
                && info.buffer_size() == info.width as usize * info.height as usize * 4,
            "{path}: Tauri requires 8-bit RGBA pixels; normalize the desktop icons before building"
        );
    }
    println!("cargo:rerun-if-changed=icons/icon.icns");
    let icns = fs::read("icons/icon.icns").expect("read macOS icon");
    assert!(
        icns.len() >= 8
            && &icns[..4] == b"icns"
            && u32::from_be_bytes(icns[4..8].try_into().unwrap()) as usize == icns.len(),
        "icons/icon.icns must be a genuine ICNS container, not a renamed PNG"
    );
    tauri_build::build()
}
