## Builder.io Plugin -- AI Instructions

You have access to a full-featured Builder.io management plugin via the DevOps Pilot API. This is a complete CMS management system -- the user should never need to open Builder.io separately. You can create, edit, delete, publish, unpublish, audit, export, and generate content. You can also read the local codebase to discover components and work on the frontend.

**All routes are at** `http://127.0.0.1:3800/api/plugins/builderio/`

### IMPORTANT: Start with Context

**Before doing ANY Builder.io work, fetch the project context first:**

```bash
# Full health check -- models, entries, drafts, repo info, preview URL
curl -s http://127.0.0.1:3800/api/plugins/builderio/health
```

**Then use summaries to understand content structure:**

```bash
# Plain-text overview of all models with entry counts and field schemas
curl -s http://127.0.0.1:3800/api/plugins/builderio/summary

# Detailed summary of a specific model (schema + all entries with data previews)
curl -s http://127.0.0.1:3800/api/plugins/builderio/summary/MODEL_NAME
```

### Multi-Space Management

The plugin supports multiple Builder.io spaces. The active space is used for all operations.

```bash
# List all spaces
curl -s http://127.0.0.1:3800/api/plugins/builderio/spaces

# Switch active space
curl -s -X POST http://127.0.0.1:3800/api/plugins/builderio/spaces/active \
  -H "Content-Type: application/json" -d '{"name":"My Space"}'

# Add a new space
curl -s -X POST http://127.0.0.1:3800/api/plugins/builderio/spaces \
  -H "Content-Type: application/json" \
  -d '{"name":"My Space","privateKey":"bpk-...","publicKey":"...","previewUrl":"https://mysite.com","repoPath":"C:/Code/my-site","dashboardUrl":"https://builder.io/content"}'
```

### Pre-Made Scripts

**From bash**, prefix scripts with:
```bash
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "./dashboard/plugins/builderio/scripts/ScriptName.ps1"
powershell.exe -ExecutionPolicy Bypass -NoProfile -Command "./dashboard/plugins/builderio/scripts/ScriptName.ps1 -Param 'value'"
```

| Script | Description | Parameters |
|--------|-------------|------------|
| `Get-SpaceSummary.ps1` | Full overview of all models | |
| `Get-Health.ps1` | Health: models, entries, drafts, issues | |
| `Get-Models.ps1` | List models with field counts | |
| `Get-Entries.ps1` | List entries of a model | `-Model "blog-post" [-Limit 20]` |
| `Get-ContentSummary.ps1` | Detailed model + entries summary | `-Model "blog-post"` |
| `New-Entry.ps1` | Create entry from JSON file | `-Model "blog-post" -JsonFile ".ai-workspace/entry.json"` |
| `Update-Entry.ps1` | Update entry fields from JSON | `-Model "blog-post" -Id "abc123" -JsonFile ".ai-workspace/patch.json"` |
| `Remove-Entry.ps1` | Delete an entry | `-Model "blog-post" -Id "abc123" [-Force]` |
| `Publish-Entry.ps1` | Publish a draft entry | `-Model "blog-post" -Id "abc123"` |
| `Unpublish-Entry.ps1` | Unpublish an entry | `-Model "blog-post" -Id "abc123"` |
| `Export-Entries.ps1` | Export all entries | `-Model "blog-post" [-OutFile "export.json"]` |
| `New-Model.ps1` | Create a new model | `-Name "faq" -Kind "data" [-JsonFile "fields.json"]` |
| `Get-Components.ps1` | List frontend components from repo | |
| `Get-RepoInfo.ps1` | Local repo info (framework) | |
| `Switch-Space.ps1` | Switch active space | `-Name "My Space"` |
| `Get-Insights.ps1` | Content quality scan (stale, missing alt, broken URLs, duplicates) | `[-Issue "missing-alt"] [-Model "page"]` |
| `Get-Assets.ps1` | List assets in the space | `[-Query "hero"] [-Max 5000]` |
| `Get-AssetUsage.ps1` | Find which entries use an asset URL | `-Url "https://cdn.builder.io/..."` |
| `Remove-Asset.ps1` | Delete an asset | `-Id "abc123" [-Force]` |
| `Get-PreviewUrl.ps1` | Resolve preview URL(s) for an entry (executes dynamic editingUrlLogic) | `-Model "page" -EntryId "abc"` |
| `Get-ModelSchema.ps1` | Inspect a model's fields and types | `-Name "page" [-Json]` |

### Model Operations

```bash
# List all models (non-archived)
curl -s http://127.0.0.1:3800/api/plugins/builderio/models

# Get a specific model by ID
curl -s http://127.0.0.1:3800/api/plugins/builderio/models/MODEL_ID

# Create a model
curl -s -X POST http://127.0.0.1:3800/api/plugins/builderio/models \
  -H "Content-Type: application/json" \
  -d '{"name":"blog-post","kind":"data","fields":[{"name":"title","type":"string","required":true},{"name":"content","type":"richText"}]}'

# Update model fields
curl -s -X PATCH http://127.0.0.1:3800/api/plugins/builderio/models/MODEL_ID \
  -H "Content-Type: application/json" -d '{"fields":[...]}'

# Delete a model
curl -s -X DELETE http://127.0.0.1:3800/api/plugins/builderio/models/MODEL_ID
```

**Model kinds**: `data`, `page`, `component`, `section`
**Field types**: `string`, `text`, `richText`, `number`, `boolean`, `date`, `file`, `reference`, `list`, `object`, `color`, `url`, `email`

### Content Operations

```bash
# List entries (paginated)
curl -s "http://127.0.0.1:3800/api/plugins/builderio/content/MODEL_NAME?limit=100&offset=0"

# Get a specific entry
curl -s http://127.0.0.1:3800/api/plugins/builderio/content/MODEL_NAME/ENTRY_ID

# Create an entry
curl -s -X POST http://127.0.0.1:3800/api/plugins/builderio/content/MODEL_NAME \
  -H "Content-Type: application/json" \
  -d '{"name":"My Post","data":{"title":"Hello","content":"<p>World</p>"},"published":"draft"}'

# Update entry (partial)
curl -s -X PATCH http://127.0.0.1:3800/api/plugins/builderio/content/MODEL_NAME/ENTRY_ID \
  -H "Content-Type: application/json" -d '{"data":{"title":"Updated"}}'

# Delete entry
curl -s -X DELETE http://127.0.0.1:3800/api/plugins/builderio/content/MODEL_NAME/ENTRY_ID

# Publish
curl -s -X POST http://127.0.0.1:3800/api/plugins/builderio/content/MODEL_NAME/ENTRY_ID/publish

# Unpublish
curl -s -X POST http://127.0.0.1:3800/api/plugins/builderio/content/MODEL_NAME/ENTRY_ID/unpublish
```

**Published states**: `draft`, `published`, `archived`

### Bulk Operations

```bash
# Export all entries
curl -s -X POST http://127.0.0.1:3800/api/plugins/builderio/content/MODEL_NAME/export

# Import entries
curl -s -X POST http://127.0.0.1:3800/api/plugins/builderio/content/MODEL_NAME/import \
  -H "Content-Type: application/json" -d '{"entries":[...]}'

# Bulk update
curl -s -X POST http://127.0.0.1:3800/api/plugins/builderio/content/MODEL_NAME/bulk-update \
  -H "Content-Type: application/json" -d '{"entries":[{"id":"abc","updates":{"data":{"featured":true}}}]}'
```

### Local Repo Access

When a local repo path is configured:

```bash
# Repo info (framework detection)
curl -s http://127.0.0.1:3800/api/plugins/builderio/repo/info

# List frontend components
curl -s http://127.0.0.1:3800/api/plugins/builderio/repo/components

# Read any file from repo
curl -s http://127.0.0.1:3800/api/plugins/builderio/repo/file/src/components/Hero.tsx

# Browse directory tree
curl -s "http://127.0.0.1:3800/api/plugins/builderio/repo/tree?path=src/components"
```

### Key Workflows

**1. Generate Content**: Use summary to discover schema, create entries matching field structure.

**2. Create Models**: Define name, kind, and fields via POST /models.

**3. Publish/Unpublish**: Use dedicated endpoints for clean draft workflows.

**4. Content Audit**: Use /health for overview, identify stale entries and empty models.

**5. Bulk Operations**: Export, transform, re-import or bulk-update across entries.

**6. Local Development**: Read components from repo, generate new ones matching patterns, edit via Files tab.

### Opening in the Dashboard

```bash
# Open the Builder.io tab
curl -s -X POST http://127.0.0.1:3800/api/ui/view-plugin \
  -H "Content-Type: application/json" -d '{"plugin":"builderio"}'
```

### Important Notes

- Builder.io content entries have `name`, `data` (the actual content fields), and `published` status
- Models define the schema (field structure) for content entries
- Use the summary endpoint to discover field structure before creating content
- When creating entries, match the data structure of existing entries
- The `data.url` field on page-type entries determines the page path for preview
- Large datasets are paginated -- use `limit` and `offset`
- Multi-space: all operations use the active space. Switch with `/spaces/active`.

### Insights (content quality audit)

```bash
# Full scan across all models: stale entries, drafts, images without alt text, missing/duplicate URLs, missing required fields, empty models
curl -s http://127.0.0.1:3800/api/plugins/builderio/insights
```

Response shape:
- `counts`: aggregate counts (total, drafts, stale, missingAlt, missingUrl, duplicateUrl, missingField, emptyModels[])
- `entries[]`: each entry with `model`, `id`, `name`, `published`, `issues[]` (e.g. `['draft','stale','missing-alt','missing-field:title']`), `imgIssues[]` (paths + URLs of images without alt)
- `models[]`: per-model rollup

The `/health` endpoint also surfaces top-level `issues` (drafts, stale, missing-alt, empty models) as clickable cards on the Home tab.

### Assets

```bash
# List all assets in the space (auto-paginated; Builder caps at 100/page internally)
curl -s "http://127.0.0.1:3800/api/plugins/builderio/assets"
curl -s "http://127.0.0.1:3800/api/plugins/builderio/assets?query=hero&max=2000"

# Find entries that reference an asset URL (scans all entries across all models)
curl -s "http://127.0.0.1:3800/api/plugins/builderio/asset-usage?url=https%3A%2F%2Fcdn.builder.io%2F..."

# Delete an asset
curl -s -X DELETE http://127.0.0.1:3800/api/plugins/builderio/assets/ASSET_ID
```

Asset fields: `id, name, type, url, bytes, width, height, metadata, lastUsed, createdDate`.
**Note:** Builder.io does NOT expose alt text on the asset itself - alt text is set per-usage in content (Image blocks or alongside URL fields in entry data). Use `/asset-usage` to find missing alt text per usage, then patch the containing entry.

### Preview URL Resolution

```bash
# Resolves one URL per locale for a given entry, by executing the model's
# Advanced Editing URL Logic (editingUrlLogic) server-side in a sandboxed vm.
# Falls back to examplePageUrl + targeting.urlPath when no script is set.
curl -s "http://127.0.0.1:3800/api/plugins/builderio/preview-url?model=page&entryId=ABC"
```

Response: `{ urls: [{locale, url}, ...], hasScript, configuredLocales }`. Works for any space: with/without locales, with/without urlPath targeting.

### Model Schema (full JSON)

```bash
# Non-archived models with id, name, kind, fields, previewUrl
curl -s http://127.0.0.1:3800/api/plugins/builderio/models

# Full model definition including all fields, validations, defaults, subFields
curl -s http://127.0.0.1:3800/api/plugins/builderio/models/MODEL_ID
```

Use this to understand the exact field types (`text`, `longText`, `richText`, `html`, `number`, `boolean`, `color`, `date`, `file`, `url`, `list`, `object`, `reference`, `uiBlocks`) before creating/updating entries. `fields[].localized: true` means the value is a `@builder.io/core:LocalizedValue` object keyed by locale.

### Locales (for multi-language spaces)

`/health` returns `locales[]` (e.g. `['us-en','qc-fr']`) parsed from `settings.customTargetingAttributes.locale.enum`. An empty array means the space has no locale targeting set up.
