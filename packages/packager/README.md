# @evalarium/packager

The Dockerfile packages the Evalarium CLI and Chromium around a mounted frozen
bundle. The compatibility control/CDP ports are `3901` and `3924`; managed
sessions use relay/browser pairs from `5000-5007` by default. Publish that
range when clients outside the container need managed-session CDP access.

```sh
docker run --rm \
  -p 3901:3901 -p 3924:3924 -p 5000-5007:5000-5007 \
  -v /path/to/name.evalbundle:/bundle:ro evalarium-env
```
