"""BrowserGym-side client for a frozen Evalarium environment.

Run the environment first (locally or via docker):

    evalarium serve twenty-crm/pipeline-review.evalbundle \
        --host 0.0.0.0 --port 3900 --cdp-port 3922

Then drive it from Python. The browser is reachable over CDP, so any
Playwright-based agent stack (BrowserGym included) can attach to it:

    from evalarium_browsergym import EvalariumEnv

    env = EvalariumEnv("http://localhost:3900", "http://localhost:3922")
    observation = env.reset(fixture="pipeline-review", seed=42)
    page = env.page  # Playwright page attached over CDP
    page.click("text=Tasks")
    observation = env.observe()
    env.close()
"""

from __future__ import annotations

import json
import urllib.request
from typing import Any


class EvalariumControlClient:
    """Thin client for the `evalarium serve` control API."""

    def __init__(self, control_url: str) -> None:
        self.control_url = control_url.rstrip("/")

    def _call(self, method: str, path: str, body: dict | None = None) -> Any:
        data = None if body is None else json.dumps(body).encode("utf-8")
        request = urllib.request.Request(
            f"{self.control_url}{path}",
            data=data,
            method=method,
            headers={"content-type": "application/json"},
        )
        with urllib.request.urlopen(request) as response:
            return json.loads(response.read().decode("utf-8"))

    def manifest(self) -> dict:
        return self._call("GET", "/manifest")

    def reset(self, fixture: str | None = None, seed: int | None = None) -> dict:
        body: dict = {}
        if fixture is not None:
            body["fixture"] = fixture
        if seed is not None:
            body["seed"] = seed
        return self._call("POST", "/reset", body)

    def observe(self) -> dict:
        return self._call("GET", "/observation")

    def coverage(self) -> dict:
        return self._call("GET", "/coverage")

    def divergences(self) -> list:
        return self._call("GET", "/divergences")

    def request_log(self) -> list:
        return self._call("GET", "/request-log")


class EvalariumEnv:
    """Gym-style wrapper: reset/observe over the control API, actions over CDP.

    Requires the `playwright` package for page access. Observation dicts
    carry url, title, a11ySnapshot, and domDigest.
    """

    def __init__(self, control_url: str, cdp_url: str) -> None:
        self.control = EvalariumControlClient(control_url)
        self.cdp_url = cdp_url
        self._playwright = None
        self._browser = None
        self.page = None

    def reset(self, fixture: str | None = None, seed: int | None = None) -> dict:
        observation = self.control.reset(fixture=fixture, seed=seed)
        self._attach_page()
        return observation

    def observe(self) -> dict:
        return self.control.observe()

    def coverage(self) -> dict:
        return self.control.coverage()

    def _attach_page(self) -> None:
        from playwright.sync_api import sync_playwright

        if self._playwright is None:
            self._playwright = sync_playwright().start()
        if self._browser is not None:
            self._browser.close()
        self._browser = self._playwright.chromium.connect_over_cdp(self.cdp_url)
        context = self._browser.contexts[0]
        self.page = context.pages[0] if context.pages else context.new_page()

    def close(self) -> None:
        if self._browser is not None:
            self._browser.close()
            self._browser = None
        if self._playwright is not None:
            self._playwright.stop()
            self._playwright = None
        self.page = None
