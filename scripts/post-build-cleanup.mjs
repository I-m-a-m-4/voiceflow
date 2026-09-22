import fs from 'fs';
import path from 'path';

const outDir = path.resolve(process.cwd(), 'out');
if (fs.existsSync(outDir)) {
  console.log('--- Cleaning up static export directory for Tauri ---');
  
  // Large files that should not be embedded inside the Tauri desktop/mobile binaries
  const filesToDelete = [
    'voiceflow_2.7.7_x64_en-US.msi',
    'voiceflow_video.mp4',
    'computer.png',
    'computer-P.png',
    'crm.png',
    'data-vis.jpg',
    'dynamic-data-visualization-3d.jpg',
    'unify.png',
    'voiceflow.png',
    'voiceflow-signup-2.png',
    'voiceflow-signup-3.png',
    'voiceflow-signup-4.png',
    'voiceflow-signup-v3.png',
    'voiceflow-signup.png',
    'voiceflow_team_photo.png',
    'voiceflow_desktop_mastery_showcase.png',
    'voiceflow_mobile_scanning_showcase.png',
    'voiceflow_hardware_protocol_showcase.png'
  ];

  filesToDelete.forEach(file => {
    const filePath = path.join(outDir, file);
    if (fs.existsSync(filePath)) {
      console.log(`Excluding from app bundle: ${file}`);
      fs.unlinkSync(filePath);
    }
  });

  console.log('--- Cleanup complete ---');
} else {
  console.warn('Warning: out/ directory not found. Cleanup skipped.');
}
