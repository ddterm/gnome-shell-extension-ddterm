import contextlib
import queue
import logging

import pluggy
import pytest

from . import log_filter


LOGGER = logging.getLogger(__name__)

hookspec = pluggy.HookspecMarker(__name__)
hookimpl = pluggy.HookimplMarker(__name__)


class LogSyncHooks:
    @hookspec(firstresult=True)
    def log_sync_message(self, msg):
        pass

    @hookspec(firstresult=True)
    def log_sync_filter(self, msg):
        pass


class LogSyncPlugin(pluggy.PluginManager):
    def __init__(self):
        super().__init__(__name__)
        self.add_hookspecs(LogSyncHooks)

    @contextlib.contextmanager
    def with_registered(self, plugin):
        name = self.register(plugin)

        try:
            yield

        finally:
            self.unregister(plugin, name)

    def sync(self, msg):
        stack = contextlib.ExitStack()
        msg_filter = self.hook.log_sync_filter(msg=msg)
        msg_queue = None

        with stack:
            if msg_filter is not None:
                msg_queue = stack.enter_context(log_filter.capture_logs(msg_filter))

            if not self.hook.log_sync_message(msg=msg):
                return

            try:
                msg_queue.get(timeout=1)
            except queue.Empty:
                raise TimeoutError()

    def context(self, item, when):
        try:
            self.hook.log_sync_message(msg=f'Beginning of {item.nodeid} {when}')

        except Exception:
            LOGGER.exception("Can't send sync message")

        try:
            yield

        finally:
            try:
                self.sync(msg=f'End of {item.nodeid} {when}')

            except Exception:
                LOGGER.exception("Can't sync logs")

    @pytest.hookimpl(hookwrapper=True, trylast=True)
    def pytest_runtest_setup(self, item):
        yield from self.context(item, 'setup')

    @pytest.hookimpl(hookwrapper=True, trylast=True)
    def pytest_runtest_call(self, item):
        yield from self.context(item, 'call')

    @pytest.hookimpl(hookwrapper=True, trylast=True)
    def pytest_runtest_teardown(self, item):
        yield from self.context(item, 'teardown')

    @pytest.fixture(scope='session')
    def log_sync(self):
        return self
