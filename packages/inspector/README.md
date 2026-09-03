# @evalarium/inspector

Local, eval-aware inspection for model episode artifacts. The inspector shows
agent actions, observations, per-step replay traffic, divergences, reward, and
token usage; it also compares two episodes at their first differing DOM digest.

```sh
evalarium inspect episodes
```

The server binds to loopback by default and reads artifacts locally. Episode
data is never uploaded by the inspector.
