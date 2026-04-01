## Builder.io Plugin -- AI Instructions

You have access to a Builder.io management plugin via the DevOps Pilot API. This lets you manage Builder.io models (schemas) and content entries directly.

**All routes are at** `http://127.0.0.1:3800/api/plugins/builderio/`

### IMPORTANT: Start with Summaries

**Always use the summary endpoints first** -- they return pre-formatted plain text that is easy to read without jq or piping:

```bash
# Get a full overview of all models, schemas, and content counts
curl -s http://127.0.0.1:3800/api/plugins/builderio/summary

# Get detailed summary of a specific model (schema + all entries with data previews)
curl -s http://127.0.0.1:3800/api/plugins/builderio/summary/MODEL_NAME
```

The summary endpoints return **plain text**, not JSON. Use them to understand the space before doing any mutations. Only use the JSON endpoints when you need to create, update, or delete content.

### Configuration

```bash
# Check if Builder.io is configured
curl -s http://127.0.0.1:3800/api/plugins/builderio/config

# Save API keys (only needed once)
curl -s -X POST http://127.0.0.1:3800/api/plugins/builderio/config \
  -H "Content-Type: application/json" \
  -d '{"privateKey":"bpk-xxx","publicKey":"xxx"}'

# Test connection
curl -s http://127.0.0.1:3800/api/plugins/builderio/test
```

### Model Operations (Schemas)

Models define the structure (schema) of content in Builder.io. Each model has a name, kind, and fields array.

```bash
# List all models (includes field definitions)
curl -s http://127.0.0.1:3800/api/plugins/builderio/models

# Get a specific model by ID
curl -s http://127.0.0.1:3800/api/plugins/builderio/models/MODEL_ID

# Create a model
curl -s -X POST http://127.0.0.1:3800/api/plugins/builderio/models \
  -H "Content-Type: application/json" \
  -d '{
    "name": "blog-post",
    "kind": "data",
    "fields": [
      { "name": "title", "type": "string", "required": true },
      { "name": "content", "type": "richText" },
      { "name": "author", "type": "string" },
      { "name": "publishDate", "type": "date" },
      { "name": "image", "type": "file" },
      { "name": "tags", "type": "list", "subType": "string" }
    ]
  }'

# Update a model's fields (name and kind are immutable)
curl -s -X PATCH http://127.0.0.1:3800/api/plugins/builderio/models/MODEL_ID \
  -H "Content-Type: application/json" \
  -d '{"fields": [...]}'

# Delete a model
curl -s -X DELETE http://127.0.0.1:3800/api/plugins/builderio/models/MODEL_ID
```

**Model kinds**: `data` (structured data), `page` (page models), `component` (reusable components), `section` (page sections)

**Field types**: `string`, `text`, `richText`, `number`, `boolean`, `date`, `file`, `reference`, `list`, `object`, `color`, `url`, `email`

**Field structure**:
```json
{
  "name": "fieldName",
  "type": "string",
  "required": true,
  "defaultValue": "default",
  "helperText": "Description shown to editors",
  "subType": "string",
  "subFields": [],
  "model": "referenced-model-name"
}
```

- Use `subType` with `list` fields to specify the list item type
- Use `subFields` with `object` fields for nested structures
- Use `model` with `reference` fields to point to another model

### Content Operations

Content entries are instances of a model. Each has a name, data object, and published status.

```bash
# List content for a model (paginated)
curl -s "http://127.0.0.1:3800/api/plugins/builderio/content/MODEL_NAME?limit=100&offset=0"

# Get a specific content entry
curl -s http://127.0.0.1:3800/api/plugins/builderio/content/MODEL_NAME/CONTENT_ID

# Create content
curl -s -X POST http://127.0.0.1:3800/api/plugins/builderio/content/MODEL_NAME \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Blog Post",
    "data": {
      "title": "Hello World",
      "content": "<p>Post content here</p>",
      "author": "John Doe",
      "publishDate": "2025-01-15",
      "tags": ["news", "updates"]
    },
    "published": "draft"
  }'

# Update content (partial update)
curl -s -X PATCH http://127.0.0.1:3800/api/plugins/builderio/content/MODEL_NAME/CONTENT_ID \
  -H "Content-Type: application/json" \
  -d '{"data": {"title": "Updated Title"}, "published": "published"}'

# Delete content
curl -s -X DELETE http://127.0.0.1:3800/api/plugins/builderio/content/MODEL_NAME/CONTENT_ID
```

**Published states**: `draft`, `published`, `archived`

### Bulk Operations

```bash
# Export all content from a model
curl -s -X POST http://127.0.0.1:3800/api/plugins/builderio/content/MODEL_NAME/export

# Import content entries
curl -s -X POST http://127.0.0.1:3800/api/plugins/builderio/content/MODEL_NAME/import \
  -H "Content-Type: application/json" \
  -d '{
    "entries": [
      { "name": "Entry 1", "data": {...}, "published": "draft" },
      { "name": "Entry 2", "data": {...}, "published": "draft" }
    ]
  }'

# Bulk update multiple entries
curl -s -X POST http://127.0.0.1:3800/api/plugins/builderio/content/MODEL_NAME/bulk-update \
  -H "Content-Type: application/json" \
  -d '{
    "entries": [
      { "id": "CONTENT_ID_1", "updates": { "published": "published" } },
      { "id": "CONTENT_ID_2", "updates": { "data": { "status": "active" } } }
    ]
  }'
```

### Common Workflows

**1. Schema Audit**: Fetch all models, analyze field definitions, check for missing required flags, inconsistent naming, missing helperText.

**2. Content Generation**: Fetch a model's schema to understand the fields, then generate realistic content entries matching the field types and constraints.

**3. Bulk Publishing**: Export all draft content, filter entries ready for publishing, then bulk-update their `published` field to `"published"`.

**4. Schema Migration**: Fetch model, modify the fields array (add/remove/rename fields), then PATCH the model. Note: existing content may need updating to match the new schema.

**5. Content Cloning**: Export content from one model, transform the data structure if needed, import into another model.

### Pre-Made Scripts

These scripts run instantly and provide formatted output. The AI should run them and then analyze the results.

| Script | Description |
|--------|-------------|
| `Get-SpaceSummary.ps1` | Full overview of all models with content counts |
| `Get-Models.ps1` | List all models with schema details |
| `Get-ContentSummary.ps1 -Model "name"` | Content entries for a specific model with data previews |

Run from bash:
```bash
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "./dashboard/plugins/builderio/scripts/Get-SpaceSummary.ps1"
powershell.exe -ExecutionPolicy Bypass -NoProfile -Command "./dashboard/plugins/builderio/scripts/Get-ContentSummary.ps1 -Model 'blogs'"
```

### Important Notes

- Model names are URL-safe identifiers (e.g., `blog-post`, `team-member`)
- Model `name` and `kind` cannot be changed after creation -- only `fields` can be updated
- Content `data` is a flexible JSON object -- it should match the model's field schema but Builder.io does not strictly enforce this
- The `published` field controls visibility: only `"published"` entries are visible via the public Content API
- Use `includeUnpublished: true` (automatically set by the plugin) to see drafts
- Large content sets are paginated -- use `limit` and `offset` query params
- When creating content, always include a `name` field for identification
