#!/usr/bin/env node
// post-deploy-check.js
// PostToolUse hook — runs after every Bash tool call.
// Activates only when the command is `netlify deploy --prod` (or -p).
// Checks:
//   1. 5 critical URLs return HTTP 200
//   2. Smoke tests on recently changed HTML/JS files
//   3. Supabase edge function log reminder (manual — credentials not embedded)
// On failure: injects additionalContext so Claude reports exactly what failed.

const https = require('https');
const http = require('http');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');

const CRITICAL_URLS = [
  'https://sellingdubai.com',
  'https://sellingdubai.com/join',
  'https://sellingdubai.com/dashboard.html',
  'https://sellingdubai.com/pricing.html',
  'https://sellingdubai.com/boban-pepic',
];

// Broken patterns to flag in changed HTML/JS files
const SMOKE_PATTERNS = [
  {
    regex: /href="#"/g,
    message: 'href="#" found — check all primary CTAs point to real destinations',
  },
  {
    regex: /href=["']#?(?:\/?#hero-waitlist|#waitlist)/g,
    message: 'waitlist anchor href found — should be /join',
    // landing.html intentionally uses #waitlist anchors while the site is in
    // waitlist mode (~2026-04-05). Remove this exclusion when BILLING_LIVE=true.
    excludeFiles: ['landing.html'],
  },
  {
    regex: /src=["']https?:\/\/[a-z]+\.supabase\.co\/storage/g,
    message: 'raw Supabase storage URL in src — use Netlify Image CDN (/.netlify/images?url=...)',
  },
  {
    regex: /window\.\w+\s*\(\s*\)/g,
    check: (content, match) => {
      // Flag window.fn() calls that aren't guarded — naive check
      return false; // too noisy without context; skip for now
    },
  },
];

function fetchStatus(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: 12000 }, (res) => {
      resolve({ url, status: res.statusCode });
      res.resume();
    });
    req.on('timeout', () => { req.destroy(); resolve({ url, status: 'TIMEOUT' }); });
    req.on('error', (e) => resolve({ url, status: `ERROR: ${e.message}` }));
  });
}

function getChangedFiles() {
  try {
    // Files changed in the last commit
    const lastCommit = execSync('git -C ' + PROJECT_ROOT + ' diff --name-only HEAD~1 HEAD 2>/dev/null', { encoding: 'utf8' }).trim();
    // Also include unstaged changes (in case deploy was before commit)
    const unstaged = execSync('git -C ' + PROJECT_ROOT + ' diff --name-only 2>/dev/null', { encoding: 'utf8' }).trim();
    const staged = execSync('git -C ' + PROJECT_ROOT + ' diff --cached --name-only 2>/dev/null', { encoding: 'utf8' }).trim();
    const allLines = [...new Set([lastCommit, unstaged, staged].join('\n').split('\n').filter(Boolean))];
    return allLines.filter(f => /\.(html|js)$/.test(f));
  } catch {
    return [];
  }
}

function smokeTestFile(relPath) {
  const fullPath = path.join(PROJECT_ROOT, relPath);
  if (!fs.existsSync(fullPath)) return [];
  const content = fs.readFileSync(fullPath, 'utf8');
  const issues = [];

  for (const { regex, message, check, excludeFiles } of SMOKE_PATTERNS) {
    if (check) continue; // skip patterns with custom check=false
    if (excludeFiles && excludeFiles.some(f => relPath.endsWith(f))) continue;
    const matches = content.match(regex);
    if (matches) {
      issues.push(`${message} (${matches.length} occurrence${matches.length > 1 ? 's' : ''})`);
    }
  }

  // Check mismatched <script> tags
  const scriptOpens = (content.match(/<script[\s>]/gi) || []).length;
  const scriptCloses = (content.match(/<\/script>/gi) || []).length;
  if (scriptOpens !== scriptCloses) {
    issues.push(`mismatched <script> tags: ${scriptOpens} open, ${scriptCloses} close`);
  }

  return issues;
}

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 15000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => (input += chunk));
process.stdin.on('end', async () => {
  clearTimeout(stdinTimeout);

  try {
    const data = JSON.parse(input);

    // Only act on Bash tool calls
    if (data.tool_name !== 'Bash') process.exit(0);

    const command = (data.tool_input?.command || '');

    // Only act on netlify deploy --prod
    if (!/netlify\s+deploy/.test(command) || !/-{1,2}prod\b|-p\b/.test(command)) {
      process.exit(0);
    }

    const lines = [];
    const failures = [];

    lines.push('');
    lines.push('POST-DEPLOY CHECKS');
    lines.push('══════════════════════════════════════════');

    // ── 1. URL Health ────────────────────────────────
    lines.push('');
    lines.push('URL Health (5 critical pages):');
    const results = await Promise.all(CRITICAL_URLS.map(fetchStatus));
    for (const { url, status } of results) {
      const ok = status === 200;
      lines.push(`  ${ok ? '✓' : '✗'} ${status}  ${url}`);
      if (!ok) failures.push(`URL ${url} returned ${status}`);
    }

    // ── 2. Smoke Tests ───────────────────────────────
    lines.push('');
    lines.push('Smoke Tests (recently changed files):');
    const changedFiles = getChangedFiles();
    if (changedFiles.length === 0) {
      lines.push('  (no HTML/JS files changed)');
    } else {
      for (const file of changedFiles) {
        const issues = smokeTestFile(file);
        if (issues.length === 0) {
          lines.push(`  ✓ ${file}`);
        } else {
          for (const issue of issues) {
            lines.push(`  ✗ ${file}: ${issue}`);
            failures.push(`${file}: ${issue}`);
          }
        }
      }
    }

    // ── 3. Supabase Edge Function Logs ──────────────
    lines.push('');
    lines.push('Supabase Edge Function Logs:');
    lines.push('  Check manually for errors in the last 10 min:');
    lines.push('  https://supabase.com/dashboard/project/pjyorgedaxevxophpfib/functions');

    // ── Summary ──────────────────────────────────────
    lines.push('');
    lines.push('══════════════════════════════════════════');
    if (failures.length > 0) {
      lines.push(`❌ ${failures.length} check(s) FAILED:`);
      for (const f of failures) lines.push(`   • ${f}`);
      lines.push('');
      lines.push('Do not confirm the deploy as healthy until these are resolved.');
    } else {
      lines.push('✅ All automated checks passed.');
      lines.push('   Verify Supabase edge function logs manually (link above).');
    }
    lines.push('');

    const message = lines.join('\n');

    if (failures.length > 0) {
      // Inject failure as additionalContext so Claude reports it to the user
      process.stdout.write(JSON.stringify({ additionalContext: message }));
      process.exit(1);
    } else {
      process.stdout.write(JSON.stringify({ additionalContext: message }));
      process.exit(0);
    }
  } catch (e) {
    // Never crash the main flow
    process.exit(0);
  }
});
