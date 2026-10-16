#[cfg(target_os = "windows")]
pub fn capture_primary_screen_bmp() -> Result<Vec<u8>, String> {
    use windows::Win32::Graphics::Gdi::*;
    use windows::Win32::UI::WindowsAndMessaging::*;

    unsafe {
        // Desktop window DC: pass None for hwnd
        let hdc_screen = GetDC(None);
        if hdc_screen.0.is_null() {
            return Err("Failed to get desktop DC".into());
        }

        let width = GetSystemMetrics(SM_CXSCREEN);
        let height = GetSystemMetrics(SM_CYSCREEN);

        if width <= 0 || height <= 0 {
            ReleaseDC(None, hdc_screen);
            return Err("Invalid display metrics".into());
        }

        let hdc_mem = CreateCompatibleDC(Some(hdc_screen));
        if hdc_mem.0.is_null() {
            ReleaseDC(None, hdc_screen);
            return Err("Failed to create memory DC".into());
        }

        let hbitmap = CreateCompatibleBitmap(hdc_screen, width, height);
        if hbitmap.0.is_null() {
            let _ = DeleteDC(hdc_mem);
            ReleaseDC(None, hdc_screen);
            return Err("Failed to create bitmap".into());
        }

        let old_bitmap = SelectObject(hdc_mem, hbitmap.into());

        let blt_res = BitBlt(
            hdc_mem,
            0,
            0,
            width,
            height,
            Some(hdc_screen),
            0,
            0,
            SRCCOPY,
        );

        if blt_res.is_err() {
            SelectObject(hdc_mem, old_bitmap);
            let _ = DeleteObject(hbitmap.into());
            let _ = DeleteDC(hdc_mem);
            ReleaseDC(None, hdc_screen);
            return Err("BitBlt desktop failed".into());
        }

        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: height,
                biPlanes: 1,
                biBitCount: 24,
                biCompression: BI_RGB.0,
                biSizeImage: 0,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [RGBQUAD::default()],
        };

        let row_stride = ((width * 3 + 3) / 4) * 4;
        let image_size = (row_stride * height) as usize;
        let mut pixel_data = vec![0u8; image_size];

        let lines_copied = GetDIBits(
            hdc_screen,
            hbitmap,
            0,
            height as u32,
            Some(pixel_data.as_mut_ptr() as *mut _),
            &mut bmi,
            DIB_RGB_COLORS,
        );

        SelectObject(hdc_mem, old_bitmap);
        let _ = DeleteObject(hbitmap.into());
        let _ = DeleteDC(hdc_mem);
        ReleaseDC(None, hdc_screen);

        if lines_copied == 0 {
            return Err("GetDIBits failed".into());
        }

        // Standard BMP file header (14 bytes) + DIB info header (40 bytes)
        let file_header_size = 14usize;
        let info_header_size = 40usize;
        let data_offset = file_header_size + info_header_size;
        let total_file_size = data_offset + image_size;

        let mut bmp_bytes = Vec::with_capacity(total_file_size);
        bmp_bytes.extend_from_slice(b"BM");
        bmp_bytes.extend_from_slice(&(total_file_size as u32).to_le_bytes());
        bmp_bytes.extend_from_slice(&0u32.to_le_bytes()); // Reserved
        bmp_bytes.extend_from_slice(&(data_offset as u32).to_le_bytes());

        bmp_bytes.extend_from_slice(&(info_header_size as u32).to_le_bytes());
        bmp_bytes.extend_from_slice(&(width as i32).to_le_bytes());
        bmp_bytes.extend_from_slice(&(height as i32).to_le_bytes());
        bmp_bytes.extend_from_slice(&1u16.to_le_bytes()); // Planes
        bmp_bytes.extend_from_slice(&24u16.to_le_bytes()); // 24-bit RGB
        bmp_bytes.extend_from_slice(&0u32.to_le_bytes()); // BI_RGB
        bmp_bytes.extend_from_slice(&(image_size as u32).to_le_bytes());
        bmp_bytes.extend_from_slice(&0u32.to_le_bytes());
        bmp_bytes.extend_from_slice(&0u32.to_le_bytes());
        bmp_bytes.extend_from_slice(&0u32.to_le_bytes());
        bmp_bytes.extend_from_slice(&0u32.to_le_bytes());

        bmp_bytes.extend_from_slice(&pixel_data);

        Ok(bmp_bytes)
    }
}

pub fn to_base64(bytes: &[u8]) -> String {
    const CHARSET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = if chunk.len() > 1 { chunk[1] as usize } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as usize } else { 0 };

        let triple = (b0 << 16) | (b1 << 8) | b2;

        result.push(CHARSET[(triple >> 18) & 0x3F] as char);
        result.push(CHARSET[(triple >> 12) & 0x3F] as char);
        if chunk.len() > 1 {
            result.push(CHARSET[(triple >> 6) & 0x3F] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(CHARSET[triple & 0x3F] as char);
        } else {
            result.push('=');
        }
    }
    result
}

#[tauri::command]
pub fn capture_screen() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let bmp_data = capture_primary_screen_bmp()?;
        let b64 = to_base64(&bmp_data);
        Ok(format!("data:image/bmp;base64,{}", b64))
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Native screen capture only supported on Windows".into())
    }
}
