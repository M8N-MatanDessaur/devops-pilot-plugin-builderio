/**
 * Builder.io Plugin -- Server-side API Routes
 * Proxies Builder.io Admin (GraphQL), Content (REST), and Write (REST) APIs.
 * Supports multiple Builder.io spaces with an active-space selector.
 * Credentials stored in config.json alongside this file.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const ADMIN_API = 'https://cdn.builder.io/api/v2/admin';
const CONTENT_API = 'https://cdn.builder.io/api/v3/content';
const WRITE_API = 'https://builder.io/api/v1/write';

const configPath = path.join(__dirname, 'config.json');
const IGNORE_DIRS = new Set(['node_modules', 'dist', '.next', 'out', 'build', 'static', '.cache', '.vercel', '.netlify', '.turbo', '__pycache__', 'coverage']);

// -- Config helpers (multi-space) ---------------------------------------------

function readAllCfg() {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    // Migrate legacy flat config (privateKey at root) to multi-space format
    if (raw.privateKey !== undefined && !raw.spaces) {
      const legacy = {
        name: 'My Space',
        privateKey: raw.privateKey || '',
        publicKey: raw.publicKey || '',
      };
      const migrated = {
        spaces: legacy.privateKey ? [legacy] : [],
        activeSpace: legacy.privateKey ? legacy.name : '',
      };
      saveAllCfg(migrated);
      return migrated;
    }
    return {
      spaces: Array.isArray(raw.spaces) ? raw.spaces : [],
      activeSpace: raw.activeSpace || '',
    };
  } catch (_) {
    return { spaces: [], activeSpace: '' };
  }
}

function saveAllCfg(data) {
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf8');
}

function getActiveSpace(all) {
  const a = all || readAllCfg();
  if (!a.spaces.length) return null;
  const active = a.spaces.find(s => s.name === a.activeSpace);
  return active || a.spaces[0] || null;
}

function getCfg() {
  const space = getActiveSpace();
  return space || { privateKey: '', publicKey: '' };
}

function isConfigured(cfg) {
  return !!(cfg && cfg.privateKey && cfg.publicKey);
}

// -- HTTP helpers -------------------------------------------------------------

function httpsJson(urlStr, options, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const opts = { hostname: url.hostname, path: url.pathname + url.search, ...options };
    const req = https.request(opts, (resp) => {
      let data = '';
      resp.on('data', chunk => { data += chunk; });
      resp.on('end', () => {
        try { resolve({ status: resp.statusCode, data: JSON.parse(data) }); }
        catch (_) { resolve({ status: resp.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function gql(privateKey, query, variables = {}) {
  const r = await httpsJson(ADMIN_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${privateKey}` },
  }, JSON.stringify({ query, variables }));
  if (r.data && r.data.errors && r.data.errors.length) throw new Error(r.data.errors[0].message);
  if (!r.data || !r.data.data) throw new Error('No data from Builder.io');
  return r.data.data;
}

async function writeApi(method, modelPath, privateKey, body) {
  return httpsJson(`${WRITE_API}/${modelPath}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${privateKey}` },
  }, body ? JSON.stringify(body) : null);
}

async function contentApi(modelPath, privateKey) {
  return httpsJson(`${CONTENT_API}/${modelPath}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${privateKey}` },
  });
}

// -- Route Registration -------------------------------------------------------

module.exports = function ({ addPrefixRoute, json, readBody }) {

  addPrefixRoute(async (req, res, url, subpath) => {
    const method = req.method;

    try {
      // -- Config (active space info) -------------------------------------------
      if (subpath === '/config' && method === 'GET') {
        const cfg = getCfg();
        return json(res, {
          configured: isConfigured(cfg),
          publicKey: cfg.publicKey || '',
          privateKeySet: !!cfg.privateKey,
          previewUrl: cfg.previewUrl || '',
          repoPath: cfg.repoPath || '',
          dashboardUrl: cfg.dashboardUrl || '',
        });
      }

      if (subpath === '/config' && method === 'POST') {
        const body = await readBody(req);
        const all = readAllCfg();
        const space = getActiveSpace(all);
        if (!space) return json(res, { error: 'No active space' }, 400);
        if (body.privateKey !== undefined) space.privateKey = body.privateKey;
        if (body.publicKey !== undefined) space.publicKey = body.publicKey;
        const idx = all.spaces.findIndex(s => s.name === space.name);
        if (idx >= 0) all.spaces[idx] = space;
        saveAllCfg(all);
        return json(res, { ok: true });
      }

      if (subpath === '/test' && method === 'GET') {
        const cfg = getCfg();
        if (!isConfigured(cfg)) return json(res, { ok: false, error: 'Not configured' });
        try {
          await gql(cfg.privateKey, '{ models { id name } }');
          return json(res, { ok: true });
        } catch (e) {
          return json(res, { ok: false, error: e.message });
        }
      }

      // -- Spaces (multi-space management) ------------------------------------
      if (subpath === '/spaces' && method === 'GET') {
        const all = readAllCfg();
        return json(res, {
          spaces: all.spaces.map(s => ({
            name: s.name,
            publicKey: s.publicKey || '',
            privateKeySet: !!s.privateKey,
            previewUrl: s.previewUrl || '',
            repoPath: s.repoPath || '',
            dashboardUrl: s.dashboardUrl || '',
          })),
          activeSpace: all.activeSpace || '',
        });
      }

      if (subpath === '/spaces' && method === 'POST') {
        const body = await readBody(req);
        if (!body.name || !body.privateKey || !body.publicKey) {
          return json(res, { error: 'name, privateKey, and publicKey are all required.' }, 400);
        }
        const all = readAllCfg();
        const name = String(body.name).trim();
        if (all.spaces.find(s => s.name === name)) {
          return json(res, { error: 'A space with that name already exists.' }, 409);
        }
        all.spaces.push({
          name,
          privateKey: String(body.privateKey),
          publicKey: String(body.publicKey).trim(),
          previewUrl: body.previewUrl ? String(body.previewUrl).trim().replace(/\/+$/, '') : '',
          repoPath: body.repoPath ? String(body.repoPath).trim().replace(/\/+$/, '') : '',
          dashboardUrl: body.dashboardUrl ? String(body.dashboardUrl).trim().replace(/\/+$/, '') : '',
        });
        if (!all.activeSpace) all.activeSpace = name;
        saveAllCfg(all);
        return json(res, { ok: true });
      }

      if (subpath === '/spaces/active' && method === 'POST') {
        const body = await readBody(req);
        if (!body.name) return json(res, { error: 'name is required.' }, 400);
        const all = readAllCfg();
        const space = all.spaces.find(s => s.name === body.name);
        if (!space) return json(res, { error: 'Space not found.' }, 404);
        all.activeSpace = body.name;
        saveAllCfg(all);
        return json(res, { ok: true, activeSpace: body.name });
      }

      if (subpath.startsWith('/spaces/') && subpath !== '/spaces/active' && method === 'PUT') {
        const spaceName = decodeURIComponent(subpath.slice('/spaces/'.length));
        const body = await readBody(req);
        const all = readAllCfg();
        const idx = all.spaces.findIndex(s => s.name === spaceName);
        if (idx < 0) return json(res, { error: 'Space not found.' }, 404);
        if (body.name !== undefined) {
          const newName = String(body.name).trim();
          if (newName !== spaceName && all.spaces.find(s => s.name === newName)) {
            return json(res, { error: 'A space with that name already exists.' }, 409);
          }
          if (all.activeSpace === spaceName) all.activeSpace = newName;
          all.spaces[idx].name = newName;
        }
        if (body.privateKey !== undefined) all.spaces[idx].privateKey = String(body.privateKey);
        if (body.publicKey !== undefined) all.spaces[idx].publicKey = String(body.publicKey).trim();
        if (body.previewUrl !== undefined) all.spaces[idx].previewUrl = String(body.previewUrl).trim().replace(/\/+$/, '');
        if (body.repoPath !== undefined) all.spaces[idx].repoPath = String(body.repoPath).trim().replace(/\/+$/, '');
        if (body.dashboardUrl !== undefined) all.spaces[idx].dashboardUrl = String(body.dashboardUrl).trim().replace(/\/+$/, '');
        saveAllCfg(all);
        return json(res, { ok: true });
      }

      if (subpath.startsWith('/spaces/') && subpath !== '/spaces/active' && method === 'DELETE') {
        const spaceName = decodeURIComponent(subpath.slice('/spaces/'.length));
        const all = readAllCfg();
        const idx = all.spaces.findIndex(s => s.name === spaceName);
        if (idx < 0) return json(res, { error: 'Space not found.' }, 404);
        all.spaces.splice(idx, 1);
        if (all.activeSpace === spaceName) all.activeSpace = all.spaces.length ? all.spaces[0].name : '';
        saveAllCfg(all);
        return json(res, { ok: true, activeSpace: all.activeSpace });
      }

      // -- Models ---------------------------------------------------------------
      if (subpath === '/models' && method === 'GET') {
        const cfg = getCfg();
        if (!cfg.privateKey) return json(res, { error: 'Not configured' }, 401);
        const data = await gql(cfg.privateKey, '{ models { id name kind fields archived } }');
        const models = (data.models || []).filter(m => !m.archived).map(m => ({
          id: m.id, name: m.name, kind: m.kind,
          fieldCount: Array.isArray(m.fields) ? m.fields.length : 0,
          fields: Array.isArray(m.fields) ? m.fields : [],
        }));
        return json(res, models);
      }

      if (subpath === '/models' && method === 'POST') {
        const cfg = getCfg();
        if (!cfg.privateKey) return json(res, { error: 'Not configured' }, 401);
        const body = await readBody(req);
        const data = await gql(cfg.privateKey, `
          mutation($body: CreateModelInput!) { createModel(body: $body) { id name } }
        `, { body: { name: body.name, kind: body.kind || 'data', fields: body.fields || [] } });
        return json(res, data.createModel);
      }

      const modelMatch = subpath.match(/^\/models\/([^/]+)$/);
      if (modelMatch) {
        const modelId = modelMatch[1];
        const cfg = getCfg();
        if (!cfg.privateKey) return json(res, { error: 'Not configured' }, 401);

        if (method === 'GET') {
          const data = await gql(cfg.privateKey, `
            query($id: String!) { model(id: $id) { id name kind fields } }
          `, { id: modelId });
          data.model.fields = Array.isArray(data.model.fields) ? data.model.fields : [];
          return json(res, data.model);
        }
        if (method === 'PATCH') {
          const body = await readBody(req);
          const data = await gql(cfg.privateKey, `
            mutation($body: UpdateModelInput!) { updateModel(body: $body) { id name } }
          `, { body: { id: modelId, data: { fields: body.fields } } });
          return json(res, data.updateModel);
        }
        if (method === 'DELETE') {
          const data = await gql(cfg.privateKey, `
            mutation($body: DeleteModelInput!) { deleteModel(body: $body) { success } }
          `, { body: { id: modelId } });
          return json(res, { ok: data.deleteModel.success });
        }
      }

      // -- Content CRUD ---------------------------------------------------------
      const contentMatch = subpath.match(/^\/content\/([^/]+)$/);
      const contentIdMatch = subpath.match(/^\/content\/([^/]+)\/([^/]+)$/);

      // Bulk operations
      const bulkMatch = subpath.match(/^\/content\/([^/]+)\/(bulk-update|export|import)$/);
      if (bulkMatch && method === 'POST') {
        const modelName = bulkMatch[1];
        const action = bulkMatch[2];
        const cfg = getCfg();
        if (!cfg.privateKey) return json(res, { error: 'Not configured' }, 401);

        if (action === 'export') {
          const allContent = [];
          let offset = 0, hasMore = true;
          while (hasMore) {
            const qp = new URLSearchParams({ apiKey: cfg.publicKey, limit: '100', offset: String(offset), includeUnpublished: 'true' });
            const r = await contentApi(`${modelName}?${qp}`, cfg.privateKey);
            const batch = (r.data.results || []);
            allContent.push(...batch);
            hasMore = batch.length >= 100;
            offset += 100;
          }
          return json(res, allContent);
        }
        if (action === 'import') {
          const body = await readBody(req);
          if (!body.entries || !Array.isArray(body.entries)) return json(res, { error: 'entries array required' }, 400);
          const results = [];
          for (const entry of body.entries) {
            try {
              const r = await writeApi('POST', modelName, cfg.privateKey, entry);
              results.push({ name: entry.name, ok: r.status < 300, id: r.data ? r.data.id : null });
            } catch (e) { results.push({ name: entry.name, ok: false, error: e.message }); }
          }
          return json(res, { total: results.length, success: results.filter(r => r.ok).length, results });
        }
        if (action === 'bulk-update') {
          const body = await readBody(req);
          if (!body.entries || !Array.isArray(body.entries)) return json(res, { error: 'entries array required' }, 400);
          const results = [];
          for (const entry of body.entries) {
            try {
              const r = await writeApi('PATCH', `${modelName}/${entry.id}`, cfg.privateKey, entry.updates);
              results.push({ id: entry.id, ok: r.status < 300 });
            } catch (e) { results.push({ id: entry.id, ok: false, error: e.message }); }
          }
          return json(res, { total: results.length, success: results.filter(r => r.ok).length, results });
        }
      }

      // Publish / Unpublish
      const pubMatch = subpath.match(/^\/content\/([^/]+)\/([^/]+)\/(publish|unpublish)$/);
      if (pubMatch && method === 'POST') {
        const [, modelName, contentId, action] = pubMatch;
        const cfg = getCfg();
        if (!cfg.privateKey) return json(res, { error: 'Not configured' }, 401);
        const newStatus = action === 'publish' ? 'published' : 'draft';
        const r = await writeApi('PATCH', `${modelName}/${contentId}`, cfg.privateKey, { published: newStatus });
        if (r.status >= 300) return json(res, { error: 'Failed to ' + action }, r.status);
        return json(res, { ok: true, status: newStatus });
      }

      // GET /content/<model>/:id
      if (contentIdMatch && method === 'GET') {
        const [, modelName, contentId] = contentIdMatch;
        const cfg = getCfg();
        if (!isConfigured(cfg)) return json(res, { error: 'Not configured' }, 401);
        const qp = new URLSearchParams({ apiKey: cfg.publicKey, includeUnpublished: 'true', query: JSON.stringify({ id: contentId }) });
        const r = await contentApi(`${modelName}?${qp}`, cfg.privateKey);
        return json(res, (r.data.results || [])[0] || null);
      }

      // PATCH /content/<model>/:id
      if (contentIdMatch && method === 'PATCH') {
        const [, modelName, contentId] = contentIdMatch;
        const cfg = getCfg();
        if (!cfg.privateKey) return json(res, { error: 'Not configured' }, 401);
        const body = await readBody(req);
        const r = await writeApi('PATCH', `${modelName}/${contentId}`, cfg.privateKey, body);
        return json(res, r.data, r.status);
      }

      // DELETE /content/<model>/:id
      if (contentIdMatch && method === 'DELETE') {
        const [, modelName, contentId] = contentIdMatch;
        const cfg = getCfg();
        if (!cfg.privateKey) return json(res, { error: 'Not configured' }, 401);
        const r = await writeApi('DELETE', `${modelName}/${contentId}`, cfg.privateKey);
        return json(res, { ok: r.status < 300 });
      }

      // GET /content/<model> (list)
      if (contentMatch && method === 'GET') {
        const modelName = contentMatch[1];
        const cfg = getCfg();
        if (!isConfigured(cfg)) return json(res, { error: 'Not configured' }, 401);
        const limit = url.searchParams.get('limit') || '100';
        const offset = url.searchParams.get('offset') || '0';
        const qp = new URLSearchParams({ apiKey: cfg.publicKey, limit, offset, includeUnpublished: 'true' });
        const query = url.searchParams.get('query');
        if (query) qp.set('query', query);
        const r = await contentApi(`${modelName}?${qp}`, cfg.privateKey);
        return json(res, r.data.results || []);
      }

      // POST /content/<model> (create)
      if (contentMatch && method === 'POST') {
        const modelName = contentMatch[1];
        const cfg = getCfg();
        if (!cfg.privateKey) return json(res, { error: 'Not configured' }, 401);
        const body = await readBody(req);
        const r = await writeApi('POST', modelName, cfg.privateKey, body);
        return json(res, r.data, r.status);
      }

      // -- Health Endpoint ------------------------------------------------------
      if (subpath === '/health' && method === 'GET') {
        const cfg = getCfg();
        if (!isConfigured(cfg)) return json(res, { error: 'Not configured' }, 401);

        const data = await gql(cfg.privateKey, '{ models { id name kind fields archived } }');
        const activeModels = (data.models || []).filter(m => !m.archived);

        let totalEntries = 0, totalPub = 0, totalDraft = 0;
        const modelStats = [];
        for (const m of activeModels) {
          const fields = Array.isArray(m.fields) ? m.fields : [];
          const qp = new URLSearchParams({ apiKey: cfg.publicKey, limit: '100', includeUnpublished: 'true' });
          const r = await contentApi(`${m.name}?${qp}`, cfg.privateKey);
          const entries = r.data.results || [];
          const pub = entries.filter(e => e.published === 'published').length;
          const draft = entries.length - pub;
          totalEntries += entries.length; totalPub += pub; totalDraft += draft;
          modelStats.push({ name: m.name, kind: m.kind, id: m.id, fieldCount: fields.length, total: entries.length, published: pub, drafts: draft });
        }

        // Recent entries across all models
        const recent = [];
        for (const m of activeModels.slice(0, 8)) {
          const qp = new URLSearchParams({ apiKey: cfg.publicKey, limit: '5', includeUnpublished: 'true' });
          const r = await contentApi(`${m.name}?${qp}`, cfg.privateKey);
          (r.data.results || []).forEach(e => { e._modelName = m.name; recent.push(e); });
        }
        recent.sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));

        const issues = [];
        if (totalDraft > 20) issues.push({ level: 'warn', message: totalDraft + ' unpublished drafts across all models.' });
        const emptyModels = modelStats.filter(m => m.total === 0);
        if (emptyModels.length) issues.push({ level: 'info', message: emptyModels.length + ' empty model(s): ' + emptyModels.map(m => m.name).join(', ') });

        return json(res, {
          publicKey: cfg.publicKey,
          previewUrl: cfg.previewUrl || '',
          repoPath: cfg.repoPath || '',
          dashboardUrl: cfg.dashboardUrl || '',
          models: modelStats,
          totalModels: activeModels.length,
          totalEntries,
          totalPublished: totalPub,
          totalDrafts: totalDraft,
          recent: recent.slice(0, 10),
          issues,
        });
      }

      // -- Summary Endpoints (AI-friendly, plain text) --------------------------
      if (subpath === '/summary' && method === 'GET') {
        const cfg = getCfg();
        if (!isConfigured(cfg)) return json(res, { error: 'Not configured' }, 401);
        const data = await gql(cfg.privateKey, '{ models { id name kind fields archived } }');
        const activeModels = (data.models || []).filter(m => !m.archived);
        const lines = ['Builder.io Space Summary', '=======================', ''];
        let totalEntries = 0, totalPub = 0, totalDraft = 0;
        for (const m of activeModels) {
          const fields = Array.isArray(m.fields) ? m.fields : [];
          const qp = new URLSearchParams({ apiKey: cfg.publicKey, limit: '100', includeUnpublished: 'true' });
          const r = await contentApi(`${m.name}?${qp}`, cfg.privateKey);
          const entries = r.data.results || [];
          const pub = entries.filter(e => e.published === 'published').length;
          const draft = entries.length - pub;
          totalEntries += entries.length; totalPub += pub; totalDraft += draft;
          lines.push(`Model: ${m.name} (${m.kind}, ${fields.length} fields)`);
          lines.push(`  Entries: ${entries.length} total, ${pub} published, ${draft} drafts`);
          lines.push(`  Fields: ${fields.map(f => f.name + ':' + f.type).join(', ')}`);
          lines.push('');
        }
        lines.splice(3, 0, `Models: ${activeModels.length} | Entries: ${totalEntries} (${totalPub} published, ${totalDraft} drafts)`, '');
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end(lines.join('\n'));
      }

      const summaryMatch = subpath.match(/^\/summary\/([^/]+)$/);
      if (summaryMatch && method === 'GET') {
        const modelName = summaryMatch[1];
        const cfg = getCfg();
        if (!isConfigured(cfg)) return json(res, { error: 'Not configured' }, 401);
        const modelsData = await gql(cfg.privateKey, '{ models { id name kind fields archived } }');
        const model = (modelsData.models || []).find(m => m.name === modelName);
        if (!model) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Model not found: ' + modelName); }
        const fields = Array.isArray(model.fields) ? model.fields : [];
        const qp = new URLSearchParams({ apiKey: cfg.publicKey, limit: '100', includeUnpublished: 'true' });
        const r = await contentApi(`${modelName}?${qp}`, cfg.privateKey);
        const entries = r.data.results || [];
        const lines = [`Model: ${model.name}`, `Kind: ${model.kind}`, `Fields (${fields.length}):`];
        for (const f of fields) {
          let desc = `  - ${f.name}: ${f.type}`;
          if (f.required) desc += ' (required)';
          if (f.helperText) desc += ` -- ${f.helperText}`;
          if (f.subType) desc += ` [subType: ${f.subType}]`;
          if (f.subFields && f.subFields.length) desc += ` [${f.subFields.length} subFields]`;
          lines.push(desc);
        }
        lines.push('', `Content Entries (${entries.length}):`, '---');
        for (const e of entries) {
          const status = e.published || 'draft';
          const updated = e.lastUpdated ? new Date(e.lastUpdated).toISOString().split('T')[0] : 'unknown';
          lines.push(`[${status}] "${e.name || '(untitled)'}" (id: ${e.id}) -- updated: ${updated}`);
          if (e.data) {
            const dataKeys = Object.keys(e.data);
            for (const k of dataKeys.slice(0, 10)) {
              let val = e.data[k];
              if (val === null || val === undefined) val = '(empty)';
              else if (typeof val === 'object') val = JSON.stringify(val).substring(0, 80) + (JSON.stringify(val).length > 80 ? '...' : '');
              else val = String(val).substring(0, 80) + (String(val).length > 80 ? '...' : '');
              lines.push(`    ${k}: ${val}`);
            }
            if (dataKeys.length > 10) lines.push(`    ... +${dataKeys.length - 10} more fields`);
          }
          lines.push('');
        }
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end(lines.join('\n'));
      }

      // -- Repo Endpoints (local codebase access) --------------------------------
      if (subpath === '/repo/info' && method === 'GET') {
        const cfg = getCfg();
        const repoPath = cfg.repoPath || '';
        if (!repoPath) return json(res, { error: 'No local repo path configured.' }, 400);
        if (!fs.existsSync(repoPath)) return json(res, { error: 'Repo path does not exist: ' + repoPath }, 404);
        const info = { repoPath, exists: true, hasPackageJson: false, framework: 'unknown' };
        if (fs.existsSync(path.join(repoPath, 'package.json'))) {
          info.hasPackageJson = true;
          try {
            const pkg = JSON.parse(fs.readFileSync(path.join(repoPath, 'package.json'), 'utf8'));
            if (pkg.dependencies && pkg.dependencies.next) info.framework = 'next';
            else if (pkg.dependencies && pkg.dependencies.gatsby) info.framework = 'gatsby';
            else if (pkg.dependencies && pkg.dependencies.react) info.framework = 'react';
            else if (pkg.dependencies && pkg.dependencies.nuxt) info.framework = 'nuxt';
          } catch (_) {}
        }
        return json(res, info);
      }

      if (subpath === '/repo/components' && method === 'GET') {
        const cfg = getCfg();
        const repoPath = cfg.repoPath || '';
        if (!repoPath || !fs.existsSync(repoPath)) return json(res, { error: 'Repo path not configured or does not exist' }, 400);
        const files = [];
        const searchDirs = [
          path.join(repoPath, 'components'),
          path.join(repoPath, 'src', 'components'),
          path.join(repoPath, 'app', 'components'),
          path.join(repoPath, 'src', 'app', 'components'),
        ];
        function findComponents(dir, depth) {
          if (depth > 4 || !fs.existsSync(dir)) return;
          try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const e of entries) {
              if (e.name.startsWith('.') || IGNORE_DIRS.has(e.name)) continue;
              const full = path.join(dir, e.name);
              if (e.isDirectory()) findComponents(full, depth + 1);
              else if (/\.(tsx|jsx|ts|js)$/.test(e.name) && !e.name.includes('.test.') && !e.name.includes('.spec.'))
                files.push({ path: full.replace(/\\/g, '/'), relativePath: path.relative(repoPath, full).replace(/\\/g, '/'), name: e.name });
            }
          } catch (_) {}
        }
        for (const dir of searchDirs) findComponents(dir, 0);
        return json(res, files);
      }

      const repoFileMatch = subpath.match(/^\/repo\/file\/(.+)$/);
      if (repoFileMatch && method === 'GET') {
        const cfg = getCfg();
        const repoPath = cfg.repoPath || '';
        if (!repoPath) return json(res, { error: 'Repo path not configured' }, 400);
        const relPath = decodeURIComponent(repoFileMatch[1]);
        const fullPath = path.resolve(repoPath, relPath);
        if (!fullPath.startsWith(path.resolve(repoPath))) return json(res, { error: 'Path outside repo' }, 403);
        if (!fs.existsSync(fullPath)) return json(res, { error: 'File not found' }, 404);
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          return json(res, { path: fullPath.replace(/\\/g, '/'), content });
        } catch (e) { return json(res, { error: e.message }, 500); }
      }

      if (subpath === '/repo/tree' && method === 'GET') {
        const cfg = getCfg();
        const repoPath = cfg.repoPath || '';
        if (!repoPath || !fs.existsSync(repoPath)) return json(res, { error: 'Repo path not configured or does not exist' }, 400);
        const subDir = url.searchParams.get('path') || '';
        const targetDir = subDir ? path.resolve(repoPath, subDir) : repoPath;
        if (!targetDir.startsWith(path.resolve(repoPath))) return json(res, { error: 'Path outside repo' }, 403);
        if (!fs.existsSync(targetDir)) return json(res, { error: 'Directory not found' }, 404);
        try {
          const entries = fs.readdirSync(targetDir, { withFileTypes: true })
            .filter(e => !e.name.startsWith('.') && !IGNORE_DIRS.has(e.name))
            .map(e => ({ name: e.name, type: e.isDirectory() ? 'dir' : 'file' }))
            .sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1);
          return json(res, { path: targetDir.replace(/\\/g, '/'), entries });
        } catch (e) { return json(res, { error: e.message }, 500); }
      }

      // -- Preview Check --------------------------------------------------------
      if (subpath === '/preview-check' && method === 'GET') {
        const target = url.searchParams.get('url');
        if (!target) return json(res, { ok: false, error: 'url required' });
        try {
          const status = await new Promise((resolve, reject) => {
            let urlObj;
            try { urlObj = new URL(target); } catch (e) { return reject(e); }
            const lib = urlObj.protocol === 'http:' ? http : https;
            const rq = lib.request({
              hostname: urlObj.hostname, port: urlObj.port || (urlObj.protocol === 'http:' ? 80 : 443),
              path: urlObj.pathname + urlObj.search, method: 'HEAD',
              headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000,
            }, (resp) => { resp.resume(); resolve(resp.statusCode); });
            rq.on('error', reject);
            rq.on('timeout', () => { rq.destroy(); reject(new Error('timeout')); });
            rq.end();
          });
          return json(res, { ok: status >= 200 && status < 400, status });
        } catch (e) { return json(res, { ok: false, error: e.message }); }
      }

      // Unknown route
      return false;

    } catch (e) {
      return json(res, { error: e.message }, 500);
    }
  });
};
