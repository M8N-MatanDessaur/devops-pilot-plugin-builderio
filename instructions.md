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
