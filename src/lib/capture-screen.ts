export async function captureScreenBase64(): Promise<string> {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: 'monitor',
      }
    });

    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;

      video.onloadedmetadata = () => {
        video.play();
        // Wait a tiny bit for the video to render frame
        setTimeout(() => {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const base64Image = canvas.toDataURL('image/jpeg', 0.7);
            
            stream.getTracks().forEach(track => track.stop());
            resolve(base64Image);
          } else {
            stream.getTracks().forEach(track => track.stop());
            resolve("");
          }
        }, 300);
      };

      video.onerror = () => {
        stream.getTracks().forEach(track => track.stop());
        resolve("");
      };
    });
  } catch (err) {
    console.warn("Screen capture skipped or permission denied:", err);
    return "";
  }
}

