import logging.handlers
import queue

import pluggy
import pytest


LOGGER = logging.getLogger(__name__)

hookspec = pluggy.HookspecMarker('logsync')
hookimpl = pluggy.HookimplMarker('logsync')


class LogSyncHooks:
    @hookspec(firstresult=True)
    def log_sync_message(self, msg):
        pass


# Matching by suffix
# During logging, various prefixes can be added to the message (like 'process[pid]:').
# Also, matching D-Bus trace messages needs to be avoided. They will contain
# escaped/quoted arguments - so there will be a quote character after the message.
class SuffixFilter(logging.Filter):
    def __init__(self, suffix):
        super().__init__()

        self.suffix = suffix

    def filter(self, record):
        message = getattr(record, 'message', None)

        if message is None:
            message = record.getMessage()

        return message.endswith(self.suffix)


class LogSyncPlugin(pluggy.PluginManager):
    def __init__(self):
        super().__init__(__name__)
        self.add_hookspecs(LogSyncHooks)

    def sync(self, msg):
        handler = logging.handlers.QueueHandler(queue.SimpleQueue())
        handler.addFilter(SuffixFilter(msg))

        logger = logging.getLogger()
        logger.addHandler(handler)

        try:
            if not self.hook.log_sync_message(msg=msg):
                return

            try:
                handler.queue.get(timeout=1)
            except queue.Empty:
                raise TimeoutError()
        finally:
            logger.removeHandler(handler)

    def sync_noexcept(self, msg):
        try:
            self.sync(msg)
        except Exception:
            LOGGER.exception("Can't sync logs")

    @pytest.hookimpl(wrapper=True, trylast=True)
    def pytest_runtest_setup(self, item):
        self.sync_noexcept(f'Beginning of {item.nodeid} setup')
        yield
        self.sync_noexcept(f'End of {item.nodeid} setup')

    @pytest.hookimpl(wrapper=True, trylast=True)
    def pytest_runtest_call(self, item):
        self.sync_noexcept(f'Beginning of {item.nodeid} call')
        yield
        self.sync_noexcept(f'End of {item.nodeid} call')

    @pytest.hookimpl(wrapper=True, trylast=True)
    def pytest_runtest_teardown(self, item):
        self.sync_noexcept(f'Beginning of {item.nodeid} teardown')
        yield
        self.sync_noexcept(f'End of {item.nodeid} teardown')

    @pytest.fixture(scope='session')
    def log_sync(self):
        return self


def pytest_configure(config):
    config.pluginmanager.register(LogSyncPlugin())
