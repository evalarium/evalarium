# @evalarium/adapter-browsergym

The TypeScript adapter wraps an in-process environment handle; the Python
example drives `evalarium serve` over its control API and CDP endpoint.

The original direct endpoint remains supported:

```python
env = EvalariumEnv("http://localhost:3901", "http://localhost:3924")
```

For an isolated managed browser, replay proxy, seed, and request log, create a
session through the same wrapper. Closing an owned session deletes it from the
server:

```python
with EvalariumEnv.create_session(
    "http://localhost:3901", fixture="default", seed=42
) as env:
    observation = env.observe()
```

Leaving the `with` block deletes the session. If a client dies without
closing, the server reaps the session once it has had no control call and no
open CDP connection for `--session-idle-timeout` seconds (default 600; `0`
disables). An agent that only drives the browser over CDP is never reaped
while its connection stays open.
