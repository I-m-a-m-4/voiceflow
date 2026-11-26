import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const TAURI_CONFIG_PATH = 'src-tauri/tauri.conf.json';
const OUTPUT_FILE = 'latest.json';

async function main() {
  try {
    const config = JSON.parse(fs.readFileSync(TAURI_CONFIG_PATH, 'utf8'));

    // Prioritize environment variable for tag name (used in CI)
    const tagName = process.env.GITHUB_REF_NAME || `v${config.version || config.package?.version}`;
    const version = tagName.startsWith('v') ? tagName.substring(1) : tagName;

    console.log(`Generating ${OUTPUT_FILE} for version ${version}...`);

    const latestJson = {
      version: tagName,
      notes: `Voiceflow Desktop v${version} release.`,
      pub_date: new Date().toISOString(),
      platforms: {},
    };

    const bundleDir = 'src-tauri/target/release/bundle';
    console.log(`Searching for signed updater artifacts in ${path.resolve(bundleDir)}...`);

    const filesToUpload = [];

    // Windows Patterns: Tauri v2 produces signed NSIS .exe + .exe.sig and MSI .msi + .msi.sig
    // Also support v1-compatible .nsis.zip / .zip if present.
    const windowsPatterns = [
      { bin: /-setup\.exe$/i, sig: /-setup\.exe\.sig$/i },
      { bin: /\.exe$/i, sig: /\.exe\.sig$/i },
      { bin: /\.msi$/i, sig: /\.msi\.sig$/i },
      { bin: /\.nsis\.zip$/i, sig: /\.nsis\.zip\.sig$/i },
      { bin: /\.zip$/i, sig: /\.zip\.sig$/i, exclude: /\.app\.tar\.gz$/i },
    ];

    for (const pattern of windowsPatterns) {
      const binPath = findFile(bundleDir, pattern.bin, pattern.exclude);
      const sigPath = binPath ? `${binPath}.sig` : findFile(bundleDir, pattern.sig);

      if (binPath && sigPath && fs.existsSync(sigPath)) {
        console.log(`Found signed Windows updater artifact: ${binPath}`);
        const fileName = path.basename(binPath);
        const signature = fs.readFileSync(sigPath, 'utf8').trim();
        latestJson.platforms['windows-x86_64'] = {
          signature,
          url: `https://github.com/I-m-a-m-4/voiceflow/releases/download/${tagName}/${encodeURIComponent(fileName)}`,
        };
        filesToUpload.push(binPath, sigPath);
        break;
      }
    }

    // macOS (.app.tar.gz + .app.tar.gz.sig)
    const appPath = findFile(bundleDir, /\.app\.tar\.gz$/i);
    const appSigPath = appPath ? `${appPath}.sig` : findFile(bundleDir, /\.app\.tar\.gz\.sig$/i);

    if (appPath && appSigPath && fs.existsSync(appSigPath)) {
      console.log('Found signed macOS updater artifact:', appPath);
      const fileName = path.basename(appPath);
      const signature = fs.readFileSync(appSigPath, 'utf8').trim();
      const entry = {
        signature,
        url: `https://github.com/I-m-a-m-4/voiceflow/releases/download/${tagName}/${encodeURIComponent(fileName)}`,
      };
      latestJson.platforms['darwin-x86_64'] = entry;
      latestJson.platforms['darwin-aarch64'] = entry;
      filesToUpload.push(appPath, appSigPath);
    }

    const foundPlatforms = Object.keys(latestJson.platforms);
    console.log(`Discovered local updater platforms:`, foundPlatforms);

    // Merge with any existing latest.json already on the GitHub Release (from tauri-action or other matrix OS)
    if (process.env.GITHUB_TOKEN) {
      try {
        execSync(`gh release download ${tagName} -p ${OUTPUT_FILE} --clobber`, { stdio: 'ignore' });
        const existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
        if (existing && typeof existing.platforms === 'object') {
          console.log('Merging with existing release latest.json platforms:', Object.keys(existing.platforms));
          latestJson.platforms = { ...existing.platforms, ...latestJson.platforms };
        }
      } catch {
        console.log('No existing latest.json found on release yet; creating fresh manifest.');
      }
    }

    if (Object.keys(latestJson.platforms).length === 0) {
      console.warn('WARNING: No signed updater artifacts found! Ensure TAURI_SIGNING_PRIVATE_KEY is set and createUpdaterArtifacts is true.');
      return;
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(latestJson, null, 2));
    console.log(`Generated ${OUTPUT_FILE} with platforms:`, Object.keys(latestJson.platforms));

    if (process.env.GITHUB_TOKEN) {
      for (const f of filesToUpload) {
        try {
          console.log(`Uploading updater artifact ${path.basename(f)} to ${tagName}...`);
          execSync(`gh release upload ${tagName} "${f}" --clobber`, { stdio: 'inherit' });
        } catch (upErr) {
          console.warn(`Artifact upload note (${path.basename(f)}):`, upErr.message);
        }
      }
      console.log(`Uploading ${OUTPUT_FILE} to release ${tagName}...`);
      execSync(`gh release upload ${tagName} ${OUTPUT_FILE} --clobber`, { stdio: 'inherit' });
    }
  } catch (error) {
    console.error('Failed to generate latest.json:', error);
    process.exit(1);
  }
}

function findFile(dir, pattern, exclude) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir, { recursive: true });
  for (const file of files) {
    const normalized = String(file).replace(/\\/g, '/');
    const fullPath = path.join(dir, normalized);
    if (pattern.test(normalized) && (!exclude || !exclude.test(normalized)) && fs.statSync(fullPath).isFile()) {
      return fullPath;
    }
  }
  return null;
}

main();
