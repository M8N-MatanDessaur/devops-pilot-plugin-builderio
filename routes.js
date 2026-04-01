/**
 * Builder.io Plugin -- Server-side API Routes
 * Proxies Builder.io Admin (GraphQL), Content (REST), and Write (REST) APIs.
 * Credentials stored in config.json alongside this file.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const ADMIN_API = 'https://cdn.builder.io/api/v2/admin';
const CONTENT_API = 'https://cdn.builder.io/api/v3/content';
const WRITE_API = 'https://builder.io/api/v1/write';

const configPath = path.join(__dirname, 'config.json');

// ── Helpers ──────────────────────────────────────────────────────────────────

function getPluginConfig() {
  try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); }
  catch (_) { return { privateKey: '', publicKey: '' }; }
}

function savePluginConfig(data) {
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf8');
}

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

// ── Route Registration ───────────────────────────────────────────────────────

module.exports = function ({ addPrefixRoute, json, readBody }) {

  addPrefixRoute(async (req, res, url, subpath) => {
    const method = req.method;

    try {
      // ── Config ─────────────────────────────────────────────────────────
      if (subpath === '/config' && method === 'GET') {
        const cfg = getPluginConfig();
        return json(res, {
          configured: !!(cfg.privateKey && cfg.publicKey),
          privateKey: cfg.privateKey || '',
          publicKey: cfg.publicKey || '',
          privateKeySet: !!cfg.privateKey,
        });
      }

      if (subpath === '/config' && method === 'POST') {
        const body = await readBody(req);
        const cfg = getPluginConfig();
        if (body.privateKey !== undefined) cfg.privateKey = body.privateKey;
        if (body.publicKey !== undefined) cfg.publicKey = body.publicKey;
        savePluginConfig(cfg);
        return json(res, { ok: true });
      }

      if (subpath === '/test' && method === 'GET') {
        const cfg = getPluginConfig();
        if (!cfg.privateKey || !cfg.publicKey) return json(res, { ok: false, error: 'Not configured' });
        try {
          await gql(cfg.privateKey, '{ models { id name } }');
          return json(res, { ok: true });
        } catch (e) {
          return json(res, { ok: false, error: e.message });
        }
      }

      // ── Models ─────────────────────────────────────────────────────────
      // GET /models
      if (subpath === '/models' && method === 'GET') {
        const cfg = getPluginConfig();
        if (!cfg.privateKey) return json(res, { error: 'Not configured' }, 401);

        const data = await gql(cfg.privateKey, '{ models { id name kind fields archived } }');
        const models = (data.models || []).filter(m => !m.archived).map(m => ({
          id: m.id, name: m.name, kind: m.kind,
          fieldCount: Array.isArray(m.fields) ? m.fields.length : 0,
          fields: Array.isArray(m.fields) ? m.fields : [],
        }));
        return json(res, models);
      }

      // POST /models
      if (subpath === '/models' && method === 'POST') {
        const cfg = getPluginConfig();
        if (!cfg.privateKey) return json(res, { error: 'Not configured' }, 401);
        const body = await readBody(req);
        const data = await gql(cfg.privateKey, `
          mutation($body: CreateModelInput!) { createModel(body: $body) { id name } }
        `, { body: { name: body.name, kind: body.kind || 'data', fields: body.fields || [] } });
        return json(res, data.createModel);
      }

      // Parameterized model routes: /models/<id>
      const modelMatch = subpath.match(/^\/models\/([^/]+)$/);
      if (modelMatch) {
        const modelId = modelMatch[1];
        const cfg = getPluginConfig();
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

      // ── Content ────────────────────────────────────────────────────────
      const contentMatch = subpath.match(/^\/content\/([^/]+)$/);
      const contentIdMatch = subpath.match(/^\/content\/([^/]+)\/([^/]+)$/);

      // Bulk operations: /content/<model>/bulk-update, /content/<model>/export, /content/<model>/import
      const bulkMatch = subpath.match(/^\/content\/([^/]+)\/(bulk-update|export|import)$/);

      if (bulkMatch && method === 'POST') {
        const modelName = bulkMatch[1];
        const action = bulkMatch[2];
        const cfg = getPluginConfig();
        if (!cfg.privateKey) return json(res, { error: 'Not configured' }, 401);

        if (action === 'export') {
          const allContent = [];
          let offset = 0;
          let hasMore = true;
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
            } catch (e) {
              results.push({ name: entry.name, ok: false, error: e.message });
            }
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
            } catch (e) {
              results.push({ id: entry.id, ok: false, error: e.message });
            }
          }
          return json(res, { total: results.length, success: results.filter(r => r.ok).length, results });
        }
      }

      // GET /content/<model>/:id
      if (contentIdMatch && method === 'GET') {
        const [, modelName, contentId] = contentIdMatch;
        const cfg = getPluginConfig();
        if (!cfg.privateKey || !cfg.publicKey) return json(res, { error: 'Not configured' }, 401);

        const qp = new URLSearchParams({ apiKey: cfg.publicKey, includeUnpublished: 'true', query: JSON.stringify({ id: contentId }) });
        const r = await contentApi(`${modelName}?${qp}`, cfg.privateKey);
        return json(res, (r.data.results || [])[0] || null);
      }

      // PATCH /content/<model>/:id
      if (contentIdMatch && method === 'PATCH') {
        const [, modelName, contentId] = contentIdMatch;
        const cfg = getPluginConfig();
        if (!cfg.privateKey) return json(res, { error: 'Not configured' }, 401);

        const body = await readBody(req);
        const r = await writeApi('PATCH', `${modelName}/${contentId}`, cfg.privateKey, body);
        return json(res, r.data, r.status);
      }

      // DELETE /content/<model>/:id
      if (contentIdMatch && method === 'DELETE') {
        const [, modelName, contentId] = contentIdMatch;
        const cfg = getPluginConfig();
        if (!cfg.privateKey) return json(res, { error: 'Not configured' }, 401);

        const r = await writeApi('DELETE', `${modelName}/${contentId}`, cfg.privateKey);
        return json(res, { ok: r.status < 300 });
      }

      // GET /content/<model> (list)
      if (contentMatch && method === 'GET') {
        const modelName = contentMatch[1];
        const cfg = getPluginConfig();
        if (!cfg.privateKey || !cfg.publicKey) return json(res, { error: 'Not configured' }, 401);

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
        const cfg = getPluginConfig();
        if (!cfg.privateKey) return json(res, { error: 'Not configured' }, 401);

        const body = await readBody(req);
        const r = await writeApi('POST', modelName, cfg.privateKey, body);
        return json(res, r.data, r.status);
      }

      // ── AI-Friendly Summary Endpoints ──────────────────────────────────
      // These return pre-formatted text so the AI doesn't need jq or piping

      // GET /summary -- overview of the entire Builder.io space
      if (subpath === '/summary' && method === 'GET') {
        const cfg = getPluginConfig();
        if (!cfg.privateKey || !cfg.publicKey) return json(res, { error: 'Not configured' }, 401);

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
        lines.unshift(''); // insert after title
        lines.splice(3, 0, `Models: ${activeModels.length} | Entries: ${totalEntries} (${totalPub} published, ${totalDraft} drafts)`, '');

        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end(lines.join('\n'));
      }

      // GET /summary/<model> -- summary of a specific model and its content
      const summaryMatch = subpath.match(/^\/summary\/([^/]+)$/);
      if (summaryMatch && method === 'GET') {
        const modelName = summaryMatch[1];
        const cfg = getPluginConfig();
        if (!cfg.privateKey || !cfg.publicKey) return json(res, { error: 'Not configured' }, 401);

        // Get model schema
        const modelsData = await gql(cfg.privateKey, '{ models { id name kind fields archived } }');
        const model = (modelsData.models || []).find(m => m.name === modelName);
        if (!model) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Model not found: ' + modelName); }
        const fields = Array.isArray(model.fields) ? model.fields : [];

        // Get content
        const qp = new URLSearchParams({ apiKey: cfg.publicKey, limit: '100', includeUnpublished: 'true' });
        const r = await contentApi(`${modelName}?${qp}`, cfg.privateKey);
        const entries = r.data.results || [];

        const lines = [
          `Model: ${model.name}`,
          `Kind: ${model.kind}`,
          `Fields (${fields.length}):`,
        ];
        for (const f of fields) {
          let desc = `  - ${f.name}: ${f.type}`;
          if (f.required) desc += ' (required)';
          if (f.helperText) desc += ` -- ${f.helperText}`;
          if (f.subType) desc += ` [subType: ${f.subType}]`;
          if (f.subFields && f.subFields.length) desc += ` [${f.subFields.length} subFields]`;
          lines.push(desc);
        }

        lines.push('', `Content Entries (${entries.length}):`);
        lines.push('---');
        for (const e of entries) {
          const status = e.published || 'draft';
          const updated = e.lastUpdated ? new Date(e.lastUpdated).toISOString().split('T')[0] : 'unknown';
          lines.push(`[${status}] "${e.name || '(untitled)'}" (id: ${e.id}) -- updated: ${updated}`);
          // Show a preview of the data fields
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

      // Unknown route -- fall through
      return false;

    } catch (e) {
      return json(res, { error: e.message }, 500);
    }
  });
};
