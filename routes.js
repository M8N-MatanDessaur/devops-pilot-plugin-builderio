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
const vm = require('vm');

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

function slugifyEnvId(s) {
  return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'env';
}

// Return the space's environments list, migrating legacy fields if needed.
// Each entry: { id, label, url, localPort, publicKey, privateKey }
function normalizeEnvironments(s) {
  if (Array.isArray(s.environments) && s.environments.length) {
    return s.environments.map(function (e) {
      var label = e.label || e.id || 'Env';
      return {
        id: e.id || slugifyEnvId(label),
        label: label,
        url: e.url || '',
        localPort: e.localPort || '',
        publicKey: e.publicKey || '',
        privateKey: e.privateKey || '',
      };
    });
  }
  var out = [];
  var prodUrl = s.prodUrl || s.previewUrl || '';
  var pk = s.publicKey || '';
  var sk = s.privateKey || '';
  if (prodUrl) out.push({ id: 'production', label: 'Production', url: prodUrl, localPort: '', publicKey: pk, privateKey: sk });
  if (s.stagingUrl) out.push({ id: 'staging', label: 'Staging', url: s.stagingUrl, localPort: '', publicKey: pk, privateKey: sk });
  if (s.localPort) out.push({ id: 'local', label: 'Local', url: '', localPort: s.localPort, publicKey: pk, privateKey: sk });
  if (!out.length) out.push({ id: 'production', label: 'Production', url: '', localPort: '', publicKey: pk, privateKey: sk });
  return out;
}

function sanitizeEnvironments(raw) {
  if (!Array.isArray(raw)) return null;
  var seen = {};
  var out = [];
  for (var i = 0; i < raw.length; i++) {
    var e = raw[i] || {};
    var label = String(e.label || '').trim();
    if (!label) continue;
    var id = String(e.id || '').trim() || slugifyEnvId(label);
    var base = id, n = 2;
    while (seen[id]) { id = base + '-' + n++; }
    seen[id] = true;
    out.push({
      id: id,
      label: label,
      url: e.url ? String(e.url).trim().replace(/\/+$/, '') : '',
      localPort: e.localPort ? String(e.localPort).trim() : '',
      publicKey: e.publicKey ? String(e.publicKey).trim() : '',
      privateKey: e.privateKey !== undefined ? String(e.privateKey) : '',
    });
  }
  return out;
}

function getActiveEnv(s) {
  var envs = normalizeEnvironments(s);
  return envs.find(function (e) { return e.id === s.activeEnv; }) || envs[0];
}

function resolveEnvUrl(env) {
  if (!env) return '';
  if (env.localPort) return 'http://localhost:' + env.localPort;
  return env.url || '';
}

function resolvePreviewUrl(cfg) {
  return resolveEnvUrl(getActiveEnv(cfg));
}

// Return the active space merged with the active env's credentials so downstream
// code can read cfg.privateKey / cfg.publicKey without knowing about envs.
function getCfg() {
  const space = getActiveSpace();
  if (!space) return { privateKey: '', publicKey: '' };
  const env = getActiveEnv(space);
  return Object.assign({}, space, {
    publicKey: (env && env.publicKey) || space.publicKey || '',
    privateKey: (env && env.privateKey) || space.privateKey || '',
  });
}

function isConfigured(cfg) {
  return !!(cfg && cfg.privateKey && cfg.publicKey);
}

function getEnvFields(s) {
  var envs = normalizeEnvironments(s);
  var active = envs.find(function (e) { return e.id === s.activeEnv; }) || envs[0];
  return {
    environments: envs.map(function (e) {
      return {
        id: e.id, label: e.label, url: e.url, localPort: e.localPort,
        publicKey: e.publicKey || '',
        privateKey: e.privateKey || '',
        privateKeySet: !!e.privateKey,
      };
    }),
    activeEnv: active ? active.id : '',
    previewUrl: resolveEnvUrl(active),
  };
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

// -- Preview URL resolution ---------------------------------------------------
// Uses the model's Advanced Editing URL Logic (editingUrlLogic) when present,
// falling back to examplePageUrl + targeting.urlPath + locale heuristics.
function buildTargeting(entry) {
  const out = {};
  for (const t of (entry && entry.query) || []) {
    if (!t || !t.property) continue;
    out[t.property] = t.value;
  }
  return out;
}

function extractEntryLocales(entry, allLocales) {
  const q = (entry && entry.query) || [];
  const localeTarget = q.find(x => x && x.property === 'locale');
  if (localeTarget) {
    const v = localeTarget.value;
    const list = Array.isArray(v) ? v : (v != null ? [v] : []);
    if (list.length) return list;
  }
  const urlTarget = q.find(x => x && x.property === 'urlPath');
  if (urlTarget && Array.isArray(urlTarget.value) && urlTarget.value.length > 1 && allLocales.length) {
    return allLocales.slice(0, urlTarget.value.length);
  }
  return allLocales.slice();
}

function runEditingUrlLogic(script, ctx) {
  const sandbox = {
    space: ctx.space,
    locale: ctx.locale,
    targeting: ctx.targeting,
    content: ctx.content,
    state: ctx.state,
    data: ctx.data,
    __r: undefined,
  };
  const code = `__r = (function(){ ${script}\n })();`;
  vm.runInNewContext(code, sandbox, { timeout: 500, displayErrors: false });
  const v = sandbox.__r;
  return typeof v === 'string' ? v : '';
}

function fallbackPreviewUrl({ examplePageUrl, pathPrefix, targeting, entry, locale }) {
  let base = String(examplePageUrl || '').replace(/\/$/, '');
  if (!base) return '';
  let slug = '';
  if (Array.isArray(targeting.urlPath)) slug = targeting.urlPath[0] || '';
  else if (typeof targeting.urlPath === 'string') slug = targeting.urlPath;
  else if (entry && entry.data && typeof entry.data.url === 'string') slug = entry.data.url;
  if (slug && !slug.startsWith('/')) slug = '/' + slug;
  const prefix = pathPrefix && pathPrefix !== '/' ? (pathPrefix.startsWith('/') ? pathPrefix : '/' + pathPrefix) : '';
  const localePart = locale ? '/' + locale : '';
  return base + prefix + localePart + slug;
}

async function resolvePreviewUrls(cfg, modelName, entryId) {
  const modelsData = await gql(cfg.privateKey, '{ models { id name examplePageUrl pathPrefix everything } }');
  const m = (modelsData.models || []).find(x => x.name === modelName);
  if (!m) return { urls: [], error: 'Model not found' };
  const script = (m.everything && m.everything.editingUrlLogic) || '';
  const examplePageUrl = m.examplePageUrl || '';
  const pathPrefix = m.pathPrefix || '';

  const qp = new URLSearchParams({ apiKey: cfg.publicKey, includeUnpublished: 'true', query: JSON.stringify({ id: entryId }) });
  const entryRes = await contentApi(`${modelName}?${qp}`, cfg.privateKey);
  const entry = (entryRes.data.results || [])[0];
  if (!entry) return { urls: [], error: 'Entry not found' };

  let configuredLocales = [];
  try {
    const s = await gql(cfg.privateKey, '{ settings }');
    const attr = s.settings && s.settings.customTargetingAttributes && s.settings.customTargetingAttributes.locale;
    if (attr && Array.isArray(attr.enum)) configuredLocales = attr.enum.slice();
  } catch (_) {}

  const entryLocales = extractEntryLocales(entry, configuredLocales);
  const targeting = buildTargeting(entry);
  const spaceObj = { publicKey: cfg.publicKey, id: cfg.publicKey };

  const resolveOne = (locale) => {
    if (script) {
      try {
        const u = runEditingUrlLogic(script, {
          space: spaceObj, locale, targeting, content: entry, state: entry.data || {}, data: entry.data || {},
        });
        if (u) return u;
      } catch (_) {}
    }
    return fallbackPreviewUrl({ examplePageUrl, pathPrefix, targeting, entry, locale });
  };

  const urls = [];
  const seen = new Set();
  if (!entryLocales.length) {
    const u = resolveOne(null);
    if (u) urls.push({ locale: null, url: u });
  } else {
    for (const loc of entryLocales) {
      const u = resolveOne(loc);
      if (!u) continue;
      const key = loc + '|' + u;
      if (seen.has(key)) continue;
      seen.add(key);
      urls.push({ locale: loc, url: u });
    }
  }
  return { urls, hasScript: !!script, configuredLocales };
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
          ...getEnvFields(cfg),
          repoPath: cfg.repoPath || '',
          dashboardUrl: cfg.dashboardUrl || '',
        });
      }

      if (subpath === '/config' && method === 'POST') {
        // Write API keys to the active environment of the active space.
        const body = await readBody(req);
        const all = readAllCfg();
        const space = getActiveSpace(all);
        if (!space) return json(res, { error: 'No active space' }, 400);
        const idx = all.spaces.findIndex(s => s.name === space.name);
        const envs = normalizeEnvironments(all.spaces[idx]);
        const envIdx = envs.findIndex(function (e) { return e.id === all.spaces[idx].activeEnv; });
        const target = envs[envIdx >= 0 ? envIdx : 0];
        if (body.privateKey !== undefined) target.privateKey = String(body.privateKey);
        if (body.publicKey !== undefined) target.publicKey = String(body.publicKey).trim();
        all.spaces[idx].environments = envs;
        all.spaces[idx].activeEnv = target.id;
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
            ...getEnvFields(s),
            repoPath: s.repoPath || '',
            dashboardUrl: s.dashboardUrl || '',
          })),
          activeSpace: all.activeSpace || '',
        });
      }

      if (subpath === '/spaces' && method === 'POST') {
        const body = await readBody(req);
        if (!body.name) return json(res, { error: 'name is required.' }, 400);
        const envs = sanitizeEnvironments(body.environments);
        if (!envs || !envs.length) {
          return json(res, { error: 'At least one environment with a public and private key is required.' }, 400);
        }
        if (!envs[0].publicKey || !envs[0].privateKey) {
          return json(res, { error: 'The first environment must include both a public and private key.' }, 400);
        }
        const all = readAllCfg();
        const name = String(body.name).trim();
        if (all.spaces.find(s => s.name === name)) {
          return json(res, { error: 'A space with that name already exists.' }, 409);
        }
        all.spaces.push({
          name,
          environments: envs,
          activeEnv: envs[0].id,
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
        if (body.environments !== undefined) {
          const clean = sanitizeEnvironments(body.environments);
          if (clean && clean.length) {
            // Preserve existing privateKey on an env when the form submits an empty string
            // (the form sends empty to mean "unchanged"). Match by id against the existing list.
            const existing = normalizeEnvironments(all.spaces[idx]);
            clean.forEach(function (e) {
              if (!e.privateKey) {
                var prev = existing.find(function (x) { return x.id === e.id; });
                if (prev && prev.privateKey) e.privateKey = prev.privateKey;
              }
            });
            all.spaces[idx].environments = clean;
            delete all.spaces[idx].prodUrl;
            delete all.spaces[idx].stagingUrl;
            delete all.spaces[idx].localPort;
            delete all.spaces[idx].previewUrl;
            delete all.spaces[idx].publicKey;
            delete all.spaces[idx].privateKey;
            if (!clean.find(function (e) { return e.id === all.spaces[idx].activeEnv; })) {
              all.spaces[idx].activeEnv = clean[0].id;
            }
          }
        }
        if (body.activeEnv !== undefined) all.spaces[idx].activeEnv = String(body.activeEnv);
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

      // -- Environment Switch ---------------------------------------------------
      if (subpath === '/env' && method === 'POST') {
        const body = await readBody(req);
        if (!body.env) return json(res, { error: 'env is required' }, 400);
        const all = readAllCfg();
        const space = getActiveSpace(all);
        if (!space) return json(res, { error: 'No active space' }, 400);
        const idx = all.spaces.findIndex(s => s.name === space.name);
        const envs = normalizeEnvironments(all.spaces[idx]);
        if (!envs.find(function (e) { return e.id === body.env; })) {
          return json(res, { error: 'Unknown env: ' + body.env }, 400);
        }
        all.spaces[idx].activeEnv = body.env;
        saveAllCfg(all);
        return json(res, { ok: true, activeEnv: body.env, previewUrl: resolvePreviewUrl(all.spaces[idx]) });
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
          previewUrl: m.previewUrl || '',
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

      // GET /preview-url?model=X&entryId=Y
      if (subpath === '/preview-url' && method === 'GET') {
        const cfg = getCfg();
        if (!isConfigured(cfg)) return json(res, { error: 'Not configured' }, 401);
        const modelName = url.searchParams.get('model');
        const entryId = url.searchParams.get('entryId');
        if (!modelName || !entryId) return json(res, { error: 'model and entryId required' }, 400);
        try {
          const result = await resolvePreviewUrls(cfg, modelName, entryId);
          return json(res, result);
        } catch (e) {
          return json(res, { error: String(e && e.message || e) }, 500);
        }
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
          modelStats.push({ name: m.name, kind: m.kind, id: m.id, fieldCount: fields.length, total: entries.length, published: pub, drafts: draft, previewUrl: m.previewUrl || '' });
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

        let locales = [];
        try {
          const s = await gql(cfg.privateKey, '{ settings }');
          const attr = s.settings && s.settings.customTargetingAttributes && s.settings.customTargetingAttributes.locale;
          if (attr && Array.isArray(attr.enum)) locales = attr.enum.slice();
        } catch (_) {}

        return json(res, {
          publicKey: cfg.publicKey,
          ...getEnvFields(cfg),
          repoPath: cfg.repoPath || '',
          dashboardUrl: cfg.dashboardUrl || '',
          models: modelStats,
          totalModels: activeModels.length,
          totalEntries,
          totalPublished: totalPub,
          totalDrafts: totalDraft,
          recent: recent.slice(0, 10),
          issues,
          locales,
        });
      }

      // -- Insights (smart dashboard: issue detection across all entries) -------
      if (subpath === '/insights' && method === 'GET') {
        const cfg = getCfg();
        if (!isConfigured(cfg)) return json(res, { error: 'Not configured' }, 401);

        const data = await gql(cfg.privateKey, '{ models { id name kind fields archived } }');
        const activeModels = (data.models || []).filter(m => !m.archived);

        // Fetch all entries per model (up to 200 each) in parallel
        const modelEntries = await Promise.all(activeModels.map(async m => {
          const qp = new URLSearchParams({ apiKey: cfg.publicKey, limit: '200', includeUnpublished: 'true', fields: 'id,name,data,published,lastUpdated,createdDate' });
          try {
            const r = await contentApi(`${m.name}?${qp}`, cfg.privateKey);
            return { model: m, entries: r.data.results || [] };
          } catch (_) {
            return { model: m, entries: [] };
          }
        }));

        const STALE_DAYS = 90;
        const staleThreshold = Date.now() - STALE_DAYS * 86400000;

        function collectImageIssues(entry, obj, path, out) {
          if (!obj || typeof obj !== 'object') return;
          if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; i++) collectImageIssues(entry, obj[i], path + '[' + i + ']', out);
            return;
          }
          // Builder Image block: { component: { name: 'Image', options: { image, altText, ... } } }
          if (obj.component && obj.component.name === 'Image') {
            const opts = obj.component.options || {};
            if (opts.image && !String(opts.altText || '').trim()) {
              out.push({ path: path + '.component.options', image: opts.image });
            }
          }
          // Generic image fields: url alongside empty alt
          const keys = Object.keys(obj);
          for (const k of keys) {
            const v = obj[k];
            if (typeof v === 'string' && /^https?:\/\/.+\.(png|jpe?g|webp|gif|svg|avif)(\?|$)/i.test(v)) {
              // Look for alt sibling
              const altKey = keys.find(x => /^alt(Text)?$/i.test(x));
              if (altKey !== undefined && !String(obj[altKey] || '').trim()) {
                out.push({ path: path + '.' + k, image: v });
              } else if (altKey === undefined && /image|photo|picture|thumbnail|hero|cover/i.test(k)) {
                out.push({ path: path + '.' + k, image: v });
              }
            }
            if (v && typeof v === 'object') collectImageIssues(entry, v, path + '.' + k, out);
          }
        }

        const entries = [];
        const urlMap = {}; // for duplicate url detection
        let totalImages = 0, imagesMissingAlt = 0;

        for (const { model, entries: list } of modelEntries) {
          const requiredFields = (Array.isArray(model.fields) ? model.fields : []).filter(f => f.required).map(f => f.name);
          for (const e of list) {
            const issues = [];
            const isDraft = e.published !== 'published';
            if (isDraft) issues.push('draft');
            const lu = e.lastUpdated || e.createdDate || 0;
            if (!isDraft && lu && lu < staleThreshold) issues.push('stale');
            if (model.kind === 'page') {
              const url = e.data && e.data.url;
              if (!url) issues.push('missing-url');
              else {
                const k = model.name + '||' + url;
                if (!urlMap[k]) urlMap[k] = [];
                urlMap[k].push(e.id);
              }
            }
            for (const rf of requiredFields) {
              const v = e.data ? e.data[rf] : undefined;
              if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) {
                issues.push('missing-field:' + rf);
              }
            }
            const imgIssues = [];
            if (e.data) collectImageIssues(e, e.data, 'data', imgIssues);
            if (imgIssues.length) {
              issues.push('missing-alt');
              imagesMissingAlt += imgIssues.length;
            }
            // rough total image count (alt or not) via quick scan
            (function countImgs(o) {
              if (!o || typeof o !== 'object') return;
              if (Array.isArray(o)) { o.forEach(countImgs); return; }
              if (o.component && o.component.name === 'Image' && o.component.options && o.component.options.image) totalImages++;
              Object.values(o).forEach(v => { if (v && typeof v === 'object') countImgs(v); });
            })(e.data);

            entries.push({
              id: e.id,
              name: e.name || e.id,
              modelName: model.name,
              modelKind: model.kind,
              status: isDraft ? 'draft' : 'published',
              lastUpdated: lu,
              issues,
              imageIssues: imgIssues,
            });
          }
        }

        // Mark duplicate urls
        Object.keys(urlMap).forEach(k => {
          if (urlMap[k].length > 1) {
            urlMap[k].forEach(id => {
              const e = entries.find(x => x.id === id);
              if (e && !e.issues.includes('duplicate-url')) e.issues.push('duplicate-url');
            });
          }
        });

        const counts = {
          total: entries.length,
          drafts: entries.filter(e => e.issues.includes('draft')).length,
          stale: entries.filter(e => e.issues.includes('stale')).length,
          missingUrl: entries.filter(e => e.issues.includes('missing-url')).length,
          duplicateUrl: entries.filter(e => e.issues.includes('duplicate-url')).length,
          missingField: entries.filter(e => e.issues.some(i => i.startsWith('missing-field:'))).length,
          missingAlt: entries.filter(e => e.issues.includes('missing-alt')).length,
          emptyModels: modelEntries.filter(x => !x.entries.length).map(x => x.model.name),
          totalImages,
          imagesMissingAlt,
        };

        return json(res, {
          models: activeModels.map(m => ({ name: m.name, kind: m.kind, total: (modelEntries.find(x => x.model.id === m.id) || {}).entries?.length || 0 })),
          counts,
          entries,
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
