"""BrowserGym-side client for a frozen Evalarium environment.

Run the environment first (locally or via docker):

    evalarium serve twenty-crm/pipeline-review.evalbundle \
        --host 0.0.0.0 --port 3901 --cdp-port 3924

Then drive it from Python. The browser is reachable over CDP, so any
Playwright-based agent stack (BrowserGym included) can attach to it:

    from evalarium_browsergym import EvalariumEnv

    env = EvalariumEnv("http://localhost:3901", "http://localhost:3924")
    observation = env.reset(fixture="pipeline-review", seed=42)
    page = env.page  # Playwright page attached over CDP
    page.click("text=Tasks")
    observation = env.observe()
    env.close()

For an isolated managed session, let the wrapper create and later delete it:

    env = EvalariumEnv.create_session(
        "http://localhost:3901", fixture="default", seed=42
    )
    observation = env.observe()
    env.close()
"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from typing import Any


class EvalariumControlClient:
    """Thin client for the `evalarium serve` control API."""

    def __init__(self, control_url: str, session_id: str | None = None) -> None:
        self.control_url = control_url.rstrip("/")
        self.session_id = session_id

    def _session_path(self, path: str) -> str:
        if self.session_id is None:
            return path
        session_id = urllib.parse.quote(self.session_id, safe="")
        return f"/sessions/{session_id}{path}"

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
        return self._call("GET", self._session_path("/manifest"))

    def reset(self, fixture: str | None = None, seed: int | None = None) -> dict:
        body: dict = {}
        if fixture is not None:
            body["fixture"] = fixture
        if seed is not None:
            body["seed"] = seed
        return self._call("POST", self._session_path("/reset"), body)

    def observe(self) -> dict:
        return self._call("GET", self._session_path("/observation"))

    def coverage(self) -> dict:
        return self._call("GET", self._session_path("/coverage"))

    def divergences(self) -> list:
        return self._call("GET", self._session_path("/divergences"))

    def request_log(self) -> list:
        return self._call("GET", self._session_path("/request-log"))

    def create_session(
        self, fixture: str | None = None, seed: int | None = None
    ) -> dict:
        body: dict = {}
        if fixture is not None:
            body["fixture"] = fixture
        if seed is not None:
            body["seed"] = seed
        return self._call("POST", "/sessions", body)

    def list_sessions(self) -> list:
        return self._call("GET", "/sessions")

    def delete_session(self, session_id: str) -> None:
        quoted_id = urllib.parse.quote(session_id, safe="")
        self._call("DELETE", f"/sessions/{quoted_id}")


class EvalariumEnv:
    """Gym-style wrapper: reset/observe over the control API, actions over CDP.

    Requires the `playwright` package for page access. Observation dicts
    carry url, title, a11ySnapshot, and domDigest.
    """

    def __init__(
        self,
        control_url: str,
        cdp_url: str,
        *,
        session_id: str | None = None,
        owns_session: bool = False,
    ) -> None:
        self.control = EvalariumControlClient(control_url, session_id=session_id)
        self.cdp_url = cdp_url
        self._session_id = session_id
        self._owns_session = owns_session
        self._playwright = None
        self._browser = None
        self.page = None

    @classmethod
    def create_session(
        cls,
        control_url: str,
        fixture: str | None = None,
        seed: int | None = None,
    ) -> "EvalariumEnv":
        root_control = EvalariumControlClient(control_url)
        description = root_control.create_session(fixture=fixture, seed=seed)
        environment = cls(
            control_url,
            description["cdpEndpoint"],
            session_id=description["id"],
            owns_session=True,
        )
        try:
            environment._attach_page()
            return environment
        except Exception:
            root_control.delete_session(description["id"])
            raise

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
        try:
            if self._browser is not None:
                self._browser.close()
                self._browser = None
            if self._playwright is not None:
                self._playwright.stop()
                self._playwright = None
            self.page = None
        finally:
            if self._owns_session and self._session_id is not None:
                EvalariumControlClient(self.control.control_url).delete_session(
                    self._session_id
                )
                self._owns_session = False
