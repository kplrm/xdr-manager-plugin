# xdr-coordinator Documentation

This directory holds the coordinator-specific docs for fleet lifecycle, API ownership, and OpenSearch data/index setup.

## Read This First

- `architecture.md`: what the plugin owns, how the runtime is structured, and where it integrates with the rest of the stack
- `api-data-model.md`: current route families, saved object types, hidden indices, and index lifecycle behavior

## Documentation Principles

- Keep fleet ownership separate from defense content ownership.
- Prefer current route families and saved object definitions over aspirational design.
- Keep cross-repo contract detail out of the README unless it is needed to explain boundaries.