//! Native Silent Windows WASAPI System Audio Loopback Capture
//!
//! Captures crystal-clear digital audio from the user's default Windows playback device
//! (headphones, earbuds, speakers, Zoom, Google Meet, Teams, Discord, browser) WITHOUT
//! any "Share Screen" dialog or permission prompt.
//!
//! Outputs 16 kHz mono 16-bit PCM WAV chunks on demand so the frontend can transcribe
//! the OTHER caller (`[THEM]`) separately from the user's microphone (`[YOU]`).

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct SystemAudioChunk {
    pub supported: bool,
    pub active: bool,
    pub wav_base64: String,
    pub duration_ms: u32,
    pub rms: f32,
    pub has_speech: bool,
}

#[cfg(target_os = "windows")]
mod win_impl {
    use super::SystemAudioChunk;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex, OnceLock};
    use std::thread::{self, JoinHandle};
    use std::time::Duration;
    use windows::core::GUID;
    use windows::Win32::Media::Audio::{
        eConsole, eRender, IAudioCaptureClient, IAudioClient, IMMDeviceEnumerator,
        MMDeviceEnumerator, AUDCLNT_BUFFERFLAGS_SILENT, AUDCLNT_SHAREMODE_SHARED,
        AUDCLNT_STREAMFLAGS_LOOPBACK, WAVEFORMATEX, WAVEFORMATEXTENSIBLE,
    };
    use windows::Win32::Media::KernelStreaming::{
        KSDATAFORMAT_SUBTYPE_PCM, WAVE_FORMAT_EXTENSIBLE,
    };
    use windows::Win32::Media::Multimedia::WAVE_FORMAT_IEEE_FLOAT;

    // Standard Microsoft KSDATAFORMAT_SUBTYPE_IEEE_FLOAT ({00000003-0000-0010-8000-00aa00389b71})
    const SUBTYPE_IEEE_FLOAT: GUID = GUID::from_u128(0x00000003_0000_0010_8000_00aa00389b71);
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL,
        COINIT_MULTITHREADED,
    };

    const TARGET_SAMPLE_RATE: u32 = 16_000;
    const MAX_BUFFER_SAMPLES: usize = (TARGET_SAMPLE_RATE as usize) * 30; // cap at 30s of mono 16kHz PCM
    const WAVE_FORMAT_PCM_TAG: u16 = 1;

    struct LoopbackController {
        running: Arc<AtomicBool>,
        samples: Arc<Mutex<Vec<i16>>>,
        thread: Option<JoinHandle<()>>,
    }

    static CONTROLLER: OnceLock<Mutex<Option<LoopbackController>>> = OnceLock::new();

    fn controller_lock() -> &'static Mutex<Option<LoopbackController>> {
        CONTROLLER.get_or_init(|| Mutex::new(None))
    }

    pub fn start() -> Result<bool, String> {
        let mut guard = controller_lock().lock().map_err(|e| e.to_string())?;
        if let Some(existing) = guard.as_ref() {
            if existing.running.load(Ordering::Relaxed) {
                return Ok(true);
            }
        }
        // Clean up any finished previous handle
        if let Some(mut old) = guard.take() {
            old.running.store(false, Ordering::SeqCst);
            if let Some(h) = old.thread.take() {
                let _ = h.join();
            }
        }

        let running = Arc::new(AtomicBool::new(true));
        let samples = Arc::new(Mutex::new(Vec::<i16>::with_capacity(TARGET_SAMPLE_RATE as usize * 8)));

        let ready_tx = std::sync::mpsc::channel::<Result<(), String>>();
        let (tx, rx) = ready_tx;

        let running_clone = running.clone();
        let samples_clone = samples.clone();

        let handle = thread::spawn(move || {
            unsafe {
                let com_hr = CoInitializeEx(None, COINIT_MULTITHREADED);
                let com_init_ok = com_hr.is_ok();

                let init_res = run_capture_loop(running_clone.clone(), samples_clone, Some(tx));
                if let Err(e) = init_res {
                    println!("Voiceflow WASAPI loopback ended: {}", e);
                }

                running_clone.store(false, Ordering::SeqCst);
                if com_init_ok {
                    CoUninitialize();
                }
            }
        });

        match rx.recv_timeout(Duration::from_secs(3)) {
            Ok(Ok(())) => {
                *guard = Some(LoopbackController {
                    running,
                    samples,
                    thread: Some(handle),
                });
                Ok(true)
            }
            Ok(Err(e)) => {
                running.store(false, Ordering::SeqCst);
                let _ = handle.join();
                Err(e)
            }
            Err(_) => {
                running.store(false, Ordering::SeqCst);
                Err("Timed out initializing Windows WASAPI system audio loopback".into())
            }
        }
    }

    pub fn stop() -> Result<(), String> {
        let mut guard = controller_lock().lock().map_err(|e| e.to_string())?;
        if let Some(mut ctrl) = guard.take() {
            ctrl.running.store(false, Ordering::SeqCst);
            if let Some(h) = ctrl.thread.take() {
                let _ = h.join();
            }
        }
        Ok(())
    }

    pub fn drain_wav() -> Result<SystemAudioChunk, String> {
        let guard = controller_lock().lock().map_err(|e| e.to_string())?;
        let Some(ctrl) = guard.as_ref() else {
            return Ok(SystemAudioChunk {
                supported: true,
                active: false,
                wav_base64: String::new(),
                duration_ms: 0,
                rms: 0.0,
                has_speech: false,
            });
        };

        let active = ctrl.running.load(Ordering::Relaxed);
        let pcm: Vec<i16> = {
            let mut buf = ctrl.samples.lock().map_err(|e| e.to_string())?;
            if buf.is_empty() {
                Vec::new()
            } else {
                std::mem::take(&mut *buf)
            }
        };

        if pcm.len() < 800 {
            // Less than 50ms of audio
            return Ok(SystemAudioChunk {
                supported: true,
                active,
                wav_base64: String::new(),
                duration_ms: ((pcm.len() as u64 * 1000) / TARGET_SAMPLE_RATE as u64) as u32,
                rms: 0.0,
                has_speech: false,
            });
        }

        let mut sum_sq: f64 = 0.0;
        let mut peak: i32 = 0;
        for &s in &pcm {
            let v = s as f64 / 32768.0;
            sum_sq += v * v;
            let a = (s as i32).abs();
            if a > peak {
                peak = a;
            }
        }
        let rms = (sum_sq / pcm.len() as f64).sqrt() as f32;
        // Very sensitive threshold so even quiet call voices on headphones are caught cleanly
        let has_speech = rms > 0.0025 || peak > 220;
        let duration_ms = ((pcm.len() as u64 * 1000) / TARGET_SAMPLE_RATE as u64) as u32;

        if !has_speech {
            return Ok(SystemAudioChunk {
                supported: true,
                active,
                wav_base64: String::new(),
                duration_ms,
                rms,
                has_speech: false,
            });
        }

        let wav_bytes = encode_wav_16k_mono(&pcm);
        let wav_base64 = encode_base64(&wav_bytes);

        Ok(SystemAudioChunk {
            supported: true,
            active,
            wav_base64,
            duration_ms,
            rms,
            has_speech: true,
        })
    }

    unsafe fn run_capture_loop(
        running: Arc<AtomicBool>,
        samples: Arc<Mutex<Vec<i16>>>,
        mut ready_tx: Option<std::sync::mpsc::Sender<Result<(), String>>>,
    ) -> Result<(), String> {
        let notify = |tx: &mut Option<std::sync::mpsc::Sender<Result<(), String>>>, res: Result<(), String>| {
            if let Some(sender) = tx.take() {
                let _ = sender.send(res);
            }
        };

        let enumerator: IMMDeviceEnumerator = match CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) {
            Ok(e) => e,
            Err(e) => {
                let msg = format!("IMMDeviceEnumerator failed: {}", e);
                notify(&mut ready_tx, Err(msg.clone()));
                return Err(msg);
            }
        };

        let device = match enumerator.GetDefaultAudioEndpoint(eRender, eConsole) {
            Ok(d) => d,
            Err(e) => {
                let msg = format!("No default Windows playback endpoint: {}", e);
                notify(&mut ready_tx, Err(msg.clone()));
                return Err(msg);
            }
        };

        let audio_client: IAudioClient = match device.Activate(CLSCTX_ALL, None) {
            Ok(c) => c,
            Err(e) => {
                let msg = format!("IAudioClient activate failed: {}", e);
                notify(&mut ready_tx, Err(msg.clone()));
                return Err(msg);
            }
        };

        let mix_format_ptr: *mut WAVEFORMATEX = match audio_client.GetMixFormat() {
            Ok(p) => p,
            Err(e) => {
                let msg = format!("GetMixFormat failed: {}", e);
                notify(&mut ready_tx, Err(msg.clone()));
                return Err(msg);
            }
        };

        let wf = &*mix_format_ptr;
        let channels = wf.nChannels.max(1) as usize;
        let src_rate = wf.nSamplesPerSec.max(8000);
        let bits = wf.wBitsPerSample;
        let tag = wf.wFormatTag;

        let is_float = if tag as u32 == WAVE_FORMAT_IEEE_FLOAT {
            true
        } else if tag as u32 == WAVE_FORMAT_EXTENSIBLE {
            let ext = &*(mix_format_ptr as *const WAVEFORMATEXTENSIBLE);
            let sub = ext.SubFormat;
            sub == SUBTYPE_IEEE_FLOAT
        } else {
            false
        };

        let is_pcm16 = if tag == WAVE_FORMAT_PCM_TAG && bits == 16 {
            true
        } else if tag as u32 == WAVE_FORMAT_EXTENSIBLE && bits == 16 {
            let ext = &*(mix_format_ptr as *const WAVEFORMATEXTENSIBLE);
            let sub = ext.SubFormat;
            sub == KSDATAFORMAT_SUBTYPE_PCM
        } else {
            false
        };

        if !is_float && !is_pcm16 {
            let msg = format!(
                "Unsupported WASAPI mix format (tag={}, bits={}, ch={}, rate={})",
                tag, bits, channels, src_rate
            );
            CoTaskMemFree(Some(mix_format_ptr as *const _));
            notify(&mut ready_tx, Err(msg.clone()));
            return Err(msg);
        }

        // 1 second buffer (in 100-nanosecond units)
        let buffer_duration: i64 = 10_000_000;
        if let Err(e) = audio_client.Initialize(
            AUDCLNT_SHAREMODE_SHARED,
            AUDCLNT_STREAMFLAGS_LOOPBACK,
            buffer_duration,
            0,
            mix_format_ptr,
            None,
        ) {
            let msg = format!("WASAPI Loopback Initialize failed: {}", e);
            CoTaskMemFree(Some(mix_format_ptr as *const _));
            notify(&mut ready_tx, Err(msg.clone()));
            return Err(msg);
        }

        let capture_client: IAudioCaptureClient = match audio_client.GetService() {
            Ok(c) => c,
            Err(e) => {
                let msg = format!("GetService(IAudioCaptureClient) failed: {}", e);
                CoTaskMemFree(Some(mix_format_ptr as *const _));
                notify(&mut ready_tx, Err(msg.clone()));
                return Err(msg);
            }
        };

        if let Err(e) = audio_client.Start() {
            let msg = format!("WASAPI audio_client.Start() failed: {}", e);
            CoTaskMemFree(Some(mix_format_ptr as *const _));
            notify(&mut ready_tx, Err(msg.clone()));
            return Err(msg);
        }

        println!(
            "Voiceflow WASAPI Loopback ACTIVE ({}Hz, {}ch, {})",
            src_rate,
            channels,
            if is_float { "f32" } else { "i16" }
        );
        notify(&mut ready_tx, Ok(()));

        // Linear-interpolation resampler state (src_rate -> 16000 Hz mono)
        let ratio = src_rate as f64 / TARGET_SAMPLE_RATE as f64;
        let mut phase: f64 = 0.0;
        let mut prev_mono: f32 = 0.0;

        while running.load(Ordering::Relaxed) {
            thread::sleep(Duration::from_millis(20));

            loop {
                let packet_len = match capture_client.GetNextPacketSize() {
                    Ok(n) => n,
                    Err(_) => break,
                };
                if packet_len == 0 {
                    break;
                }

                let mut data_ptr: *mut u8 = std::ptr::null_mut();
                let mut num_frames: u32 = 0;
                let mut flags: u32 = 0;

                if capture_client
                    .GetBuffer(&mut data_ptr, &mut num_frames, &mut flags, None, None)
                    .is_err()
                {
                    break;
                }

                let frames = num_frames as usize;
                let is_silent = (flags & (AUDCLNT_BUFFERFLAGS_SILENT.0 as u32)) != 0 || data_ptr.is_null();

                let mut chunk_16k: Vec<i16> = Vec::with_capacity(((frames as f64 / ratio) as usize) + 4);

                if is_silent {
                    // Advance phase with silence so timing stays clean without filling memory needlessly
                    let out_count = ((frames as f64 - phase) / ratio).max(0.0) as usize;
                    phase = (phase + (out_count as f64) * ratio) - frames as f64;
                    if phase < 0.0 {
                        phase = 0.0;
                    }
                    prev_mono = 0.0;
                    // Push brief silence only if buffer already has speech (keeps pauses natural)
                    if let Ok(mut buf) = samples.lock() {
                        if !buf.is_empty() && buf.len() + out_count < MAX_BUFFER_SAMPLES {
                            let new_len = buf.len() + out_count.min(1600);
                            buf.resize(new_len, 0);
                        }
                    }
                } else {
                    let mut mono_frames = Vec::with_capacity(frames);
                    if is_float {
                        let float_slice = std::slice::from_raw_parts(data_ptr as *const f32, frames * channels);
                        for f in 0..frames {
                            let mut sum = 0.0f32;
                            let base = f * channels;
                            for c in 0..channels {
                                sum += float_slice[base + c];
                            }
                            mono_frames.push(sum / channels as f32);
                        }
                    } else {
                        let i16_slice = std::slice::from_raw_parts(data_ptr as *const i16, frames * channels);
                        for f in 0..frames {
                            let mut sum = 0.0f32;
                            let base = f * channels;
                            for c in 0..channels {
                                sum += i16_slice[base + c] as f32 / 32768.0;
                            }
                            mono_frames.push(sum / channels as f32);
                        }
                    }

                    // Resample mono_frames to 16kHz
                    while phase < frames as f64 {
                        let idx = phase.floor() as isize;
                        let frac = (phase - idx as f64) as f32;
                        let s0 = if idx < 0 {
                            prev_mono
                        } else {
                            mono_frames[idx as usize]
                        };
                        let s1 = if (idx + 1) as usize >= frames {
                            mono_frames[frames - 1]
                        } else {
                            mono_frames[(idx + 1) as usize]
                        };
                        let val = (s0 + (s1 - s0) * frac).clamp(-1.0, 1.0);
                        chunk_16k.push((val * 32767.0) as i16);
                        phase += ratio;
                    }
                    phase -= frames as f64;
                    if let Some(&last) = mono_frames.last() {
                        prev_mono = last;
                    }

                    if !chunk_16k.is_empty() {
                        if let Ok(mut buf) = samples.lock() {
                            if buf.len() + chunk_16k.len() > MAX_BUFFER_SAMPLES {
                                let overflow = (buf.len() + chunk_16k.len()) - MAX_BUFFER_SAMPLES;
                                let drain_n = overflow.min(buf.len());
                                buf.drain(0..drain_n);
                            }
                            buf.extend_from_slice(&chunk_16k);
                        }
                    }
                }

                let _ = capture_client.ReleaseBuffer(num_frames);
            }
        }

        let _ = audio_client.Stop();
        CoTaskMemFree(Some(mix_format_ptr as *const _));
        Ok(())
    }

    fn encode_wav_16k_mono(samples: &[i16]) -> Vec<u8> {
        let data_bytes = (samples.len() * 2) as u32;
        let mut wav = Vec::with_capacity(44 + data_bytes as usize);
        wav.extend_from_slice(b"RIFF");
        wav.extend_from_slice(&(36u32 + data_bytes).to_le_bytes());
        wav.extend_from_slice(b"WAVE");
        wav.extend_from_slice(b"fmt ");
        wav.extend_from_slice(&16u32.to_le_bytes()); // PCM chunk size
        wav.extend_from_slice(&1u16.to_le_bytes()); // PCM format
        wav.extend_from_slice(&1u16.to_le_bytes()); // Mono
        wav.extend_from_slice(&TARGET_SAMPLE_RATE.to_le_bytes());
        wav.extend_from_slice(&(TARGET_SAMPLE_RATE * 2).to_le_bytes()); // Byte rate
        wav.extend_from_slice(&2u16.to_le_bytes()); // Block align
        wav.extend_from_slice(&16u16.to_le_bytes()); // Bits per sample
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&data_bytes.to_le_bytes());
        for &s in samples {
            wav.extend_from_slice(&s.to_le_bytes());
        }
        wav
    }

    fn encode_base64(input: &[u8]) -> String {
        const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut out = String::with_capacity(((input.len() + 2) / 3) * 4);
        for chunk in input.chunks(3) {
            let b0 = chunk[0] as u32;
            let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
            let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
            let triple = (b0 << 16) | (b1 << 8) | b2;
            out.push(TABLE[((triple >> 18) & 0x3F) as usize] as char);
            out.push(TABLE[((triple >> 12) & 0x3F) as usize] as char);
            if chunk.len() > 1 {
                out.push(TABLE[((triple >> 6) & 0x3F) as usize] as char);
            } else {
                out.push('=');
            }
            if chunk.len() > 2 {
                out.push(TABLE[(triple & 0x3F) as usize] as char);
            } else {
                out.push('=');
            }
        }
        out
    }
}

#[tauri::command]
pub fn start_system_audio_capture() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        return win_impl::start();
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

#[tauri::command]
pub fn drain_system_audio_wav() -> Result<SystemAudioChunk, String> {
    #[cfg(target_os = "windows")]
    {
        return win_impl::drain_wav();
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(SystemAudioChunk {
            supported: false,
            active: false,
            wav_base64: String::new(),
            duration_ms: 0,
            rms: 0.0,
            has_speech: false,
        })
    }
}

#[tauri::command]
pub fn stop_system_audio_capture() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        return win_impl::stop();
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(())
    }
}
