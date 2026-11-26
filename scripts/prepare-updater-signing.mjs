import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const TAURI_CONFIG_PATH = path.resolve('src-tauri/tauri.conf.json');

function setGithubEnv(name, value) {
  const envFile = process.env.GITHUB_ENV;
  if (!envFile) return;
  const delim = `VF_EOF_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  fs.appendFileSync(envFile, `${name}<<${delim}\n${value}\n${delim}\n`, 'utf8');
}

function extractKeyIdFromMinisignBase64(b64Block) {
  try {
    const text = Buffer.from(b64Block.trim(), 'base64').toString('utf8');
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return null;
    const raw = Buffer.from(lines[1], 'base64');
    if (raw.length < 10) return null;
    // Bytes 2..10 are the 8-byte little-endian minisign key ID
    return Buffer.from(raw.subarray(2, 10)).reverse().toString('hex').toUpperCase();
  } catch {
    return null;
  }
}

function main() {
  const config = JSON.parse(fs.readFileSync(TAURI_CONFIG_PATH, 'utf8'));
  const rawKeyInput = (process.env.RAW_TAURI_SIGNING_PRIVATE_KEY || '').trim();
  const rawPassword = process.env.RAW_TAURI_SIGNING_PRIVATE_KEY_PASSWORD || '';

  if (!rawKeyInput) {
    console.log(
      '::warning::TAURI_SIGNING_PRIVATE_KEY GitHub Secret is not set. Building unsigned installers for this run so MSI/EXE release artifacts still publish. Add TAURI_SIGNING_PRIVATE_KEY in Repository Settings -> Secrets -> Actions to enable signed auto-updates.'
    );
    config.bundle = config.bundle || {};
    config.bundle.createUpdaterArtifacts = false;
    fs.writeFileSync(TAURI_CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf8');
    setGithubEnv('UPDATER_SIGNED', 'false');
    return;
  }

  // Normalize key: support either standard single-line base64 Tauri key OR raw 2-line minisign secret key
  let normalizedKey = rawKeyInput;
  if (rawKeyInput.startsWith('untrusted comment:')) {
    normalizedKey = Buffer.from(rawKeyInput + '\n', 'utf8').toString('base64');
  } else {
    normalizedKey = rawKeyInput.replace(/\s+/g, '');
  }

  // Mask normalized value in GitHub Actions logs before doing anything else
  if (process.env.GITHUB_ACTIONS) {
    console.log(`::add-mask::${normalizedKey}`);
  }

  // Quick structural check before spawning tauri signer
  const decoded = Buffer.from(normalizedKey, 'base64').toString('utf8');
  if (!decoded.startsWith('untrusted comment:')) {
    console.error(
      '::error::TAURI_SIGNING_PRIVATE_KEY secret is malformed (decoded value does not start with "untrusted comment:"). Copy the full contents of ~/.tauri/voiceflow.key into the TAURI_SIGNING_PRIVATE_KEY GitHub Secret.'
    );
    process.exit(1);
  }

  // Fast 1-second smoke sign to validate key + password BEFORE spending 10+ minutes compiling Rust
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-sign-check-'));
  const probeFile = path.join(tmpDir, 'probe.txt');
  fs.writeFileSync(probeFile, 'voiceflow-signing-preflight', 'utf8');

  try {
    const isWin = process.platform === 'win32';
    const localBin = path.resolve('node_modules', '.bin', isWin ? 'tauri.cmd' : 'tauri');
    const env = {
      ...process.env,
      TAURI_SIGNING_PRIVATE_KEY: normalizedKey,
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: rawPassword,
    };

    const res = isWin
      ? spawnSync('cmd', ['/c', localBin, 'signer', 'sign', probeFile], { env, encoding: 'utf8' })
      : spawnSync(localBin, ['signer', 'sign', probeFile], { env, encoding: 'utf8' });

    if (res.status !== 0) {
      const errOut = `${res.stdout || ''}\n${res.stderr || ''}`.trim();
      console.error(
        `::error::TAURI_SIGNING_PRIVATE_KEY pre-flight signing check failed: ${errOut}\nVerify TAURI_SIGNING_PRIVATE_KEY and TAURI_SIGNING_PRIVATE_KEY_PASSWORD in GitHub Secrets.`
      );
      process.exit(1);
    }

    const sigPath = `${probeFile}.sig`;
    if (fs.existsSync(sigPath)) {
      const sigB64 = fs.readFileSync(sigPath, 'utf8').trim();
      const sigKeyId = extractKeyIdFromMinisignBase64(sigB64);
      const pubKeyB64 = config?.plugins?.updater?.pubkey || '';
      const pubKeyId = extractKeyIdFromMinisignBase64(pubKeyB64);

      if (sigKeyId && pubKeyId && sigKeyId !== pubKeyId) {
        console.error(
          `::error::TAURI_SIGNING_PRIVATE_KEY (Key ID ${sigKeyId}) does NOT match plugins.updater.pubkey in src-tauri/tauri.conf.json (Key ID ${pubKeyId}). Update TAURI_SIGNING_PRIVATE_KEY in GitHub Secrets to the matching voiceflow.key.`
        );
        process.exit(1);
      }
      console.log(`Updater signing pre-flight passed (Key ID: ${sigKeyId || 'verified'}).`);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  setGithubEnv('TAURI_SIGNING_PRIVATE_KEY', normalizedKey);
  if (rawPassword) {
    setGithubEnv('TAURI_SIGNING_PRIVATE_KEY_PASSWORD', rawPassword);
  }
  setGithubEnv('UPDATER_SIGNED', 'true');
}

main();

