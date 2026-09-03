# Evalarium MCP adapter

This package exposes one frozen Evalarium bundle as a local MCP stdio server.
It is a thin adapter over `@evalarium/runtime`: it does not contact a model,
navigate the live web, persist credentials, or provide a hosted endpoint.

Build the workspace, then configure an MCP-compatible client with an absolute
bundle path:

```json
{
  "mcpServers": {
    "evalarium": {
      "command": "evalarium",
      "args": ["mcp", "/absolute/path/to/environment.evalbundle"]
    }
  }
}
```

The standalone `evalarium-mcp <bundle>` binary exposes the same server. Add
`--headed` to the `evalarium mcp` command when a visible browser is useful for
local debugging.

The adapter provides manifest, reset, observation, click, fill, key press,
screenshot, coverage, divergence, and request-log tools. Mutating tools return
the resulting observation plus `onTrail`, which is false after any replay miss.
Tool calls for a server process are serialized so actions and observations stay
ordered.
