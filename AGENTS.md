Azgaar's Fantasy Map Generator is a web application for procedurally generating, editing, and visualizing fantasy maps. Before making architectural decisions, read the `CONTEXT.md` file in the root.

For work on this fork, read `DEVLOG.md` before starting and update it after every material change.

For AI operation of maps or MCP integration, read `docs/ai-mcp-guide.md` (clients of the server: `docs/mcp-client-guide.md`). The `fantasy-map` MCP server (`.mcp.json`) reads, edits (preview + undo), regenerates, saves and opens maps (background sessions included); do not present other browser/file bridges as MCP tools.

For deeper knowledge, consult the `docs/` directory, especially `docs/domain/glossary.md`, `docs/architecture/architecture.md` and `docs/architecture/data-model.md`.

Keep comments short and to the point. Don't repeat information that is in docs. Prefer one-liners or no comments.
