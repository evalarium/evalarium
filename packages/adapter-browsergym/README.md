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
env = EvalariumEnv.create_session(
    "http://localhost:3901", fixture="default", seed=42
)
try:
    observation = env.observe()
finally:
    env.close()
```
