/**
 * Script to delete previous GitHub Actions runs, artifacts, and caches
 * Usage: node scripts/delete-actions.mjs <GITHUB_TOKEN> [REPO_OWNER/REPO_NAME]
 */

const token = process.argv[2] || process.env.GITHUB_TOKEN;
const repoFull = process.argv[3] || 'I-m-a-m-4/voiceflow';

if (!token) {
  console.error('Error: Please provide a GitHub Personal Access Token.');
  console.error('Usage: node scripts/delete-actions.mjs <GITHUB_TOKEN> [owner/repo]');
  process.exit(1);
}

const [owner, repo] = repoFull.split('/');
const headers = {
  'Authorization': `Bearer ${token}`,
  'Accept': 'application/vnd.github+json',
  'User-Agent': 'Voiceflow-Actions-Cleaner',
  'X-GitHub-Api-Version': '2022-11-28',
};

async function deleteCaches() {
  console.log(`\n--- 1. Clearing Actions Caches for ${owner}/${repo} ---`);
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/caches`, { headers });
    if (!res.ok) {
      console.warn(`Failed to list caches: HTTP ${res.status} ${res.statusText}`);
      return;
    }
    const data = await res.json();
    const caches = data.actions_caches || [];
    console.log(`Found ${caches.length} active caches.`);
    for (const c of caches) {
      const delRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/caches/${c.id}`, {
        method: 'DELETE',
        headers,
      });
      if (delRes.ok) {
        console.log(`✓ Deleted cache: ${c.key} (${Math.round((c.size_in_bytes || 0) / 1024 / 1024)} MB)`);
      } else {
        console.warn(`Failed to delete cache ${c.id}: HTTP ${delRes.status}`);
      }
    }
  } catch (err) {
    console.warn('Error deleting caches:', err.message);
  }
}

async function deleteArtifacts() {
  console.log(`\n--- 2. Clearing Actions Artifacts for ${owner}/${repo} ---`);
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/artifacts?per_page=100`, { headers });
    if (!res.ok) {
      console.warn(`Failed to list artifacts: HTTP ${res.status} ${res.statusText}`);
      return;
    }
    const data = await res.json();
    const artifacts = data.artifacts || [];
    console.log(`Found ${artifacts.length} active artifacts.`);
    for (const a of artifacts) {
      const delRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/artifacts/${a.id}`, {
        method: 'DELETE',
        headers,
      });
      if (delRes.ok) {
        console.log(`✓ Deleted artifact: ${a.name} (${Math.round((a.size_in_bytes || 0) / 1024 / 1024)} MB)`);
      } else {
        console.warn(`Failed to delete artifact ${a.id}: HTTP ${delRes.status}`);
      }
    }
  } catch (err) {
    console.warn('Error deleting artifacts:', err.message);
  }
}

async function deleteWorkflowRuns() {
  console.log(`\n--- 3. Clearing Completed Workflow Runs for ${owner}/${repo} ---`);
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=50`, { headers });
    if (!res.ok) {
      console.warn(`Failed to list workflow runs: HTTP ${res.status} ${res.statusText}`);
      return;
    }
    const data = await res.json();
    const runs = data.workflow_runs || [];
    console.log(`Found ${runs.length} workflow runs.`);
    for (const r of runs) {
      const delRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs/${r.id}`, {
        method: 'DELETE',
        headers,
      });
      if (delRes.ok) {
        console.log(`✓ Deleted workflow run #${r.run_number} (${r.name})`);
      } else {
        console.warn(`Failed to delete run #${r.run_number}: HTTP ${delRes.status}`);
      }
    }
  } catch (err) {
    console.warn('Error deleting workflow runs:', err.message);
  }
}

async function main() {
  await deleteCaches();
  await deleteArtifacts();
  await deleteWorkflowRuns();
  console.log('\nDone! Actions storage should now be freed.');
}

main();
