export async function captureScreenBase64(): Promise<string> {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: 'monitor',
      }
    });

    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;

      video.onloadedmetadata = () => {
        video.play();
        // Wait a tiny bit for the video to actually render a frame
        setTimeout(() => {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            // Compress heavily to save bandwidth/tokens (70% quality JPEG)
            // Strip the data URL prefix here, or just keep it and strip on server
            const base64Image = canvas.toDataURL('image/jpeg', 0.7);
            
            // Stop all tracks immediately
            stream.getTracks().forEach(track => track.stop());
            resolve(base64Image);
          } else {
            stream.getTracks().forEach(track => track.stop());
            reject(new Error("Failed to get canvas context"));
          }
        }, 300); // 300ms delay ensures frame is painted
      };

      video.onerror = (e) => {
        stream.getTracks().forEach(track => track.stop());
        reject(e);
      };
    });
  } catch (err) {
    console.error("Screen capture failed", err);
    throw err;
  }
}
