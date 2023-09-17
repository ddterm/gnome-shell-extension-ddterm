import itertools
import logging

import pytest

from . import container_fixtures, dbus_util, glib_util, log_sync


LOGGER = logging.getLogger(__name__)


class SyncMessageDBus:
    def __init__(self, dbus_interface):
        self.dbus_interface = dbus_interface

    @log_sync.hookimpl
    def log_sync_message(self, msg):
        try:
            self.dbus_interface.LogMessage('(s)', msg)
            return True

        except Exception:
            LOGGER.exception("Can't send syslog message through D-Bus")


class DDTermFixtures(container_fixtures.ContainerFixtures):
    def configure_session(self, container, request):
        super().configure_session(container, request)

        extension_pack = request.getfixturevalue('extension_pack')

        if extension_pack:
            container.install_extension(extension_pack, timeout=self.START_STOP_TIMEOUT_SEC)

    @pytest.fixture(scope='class')
    def enable_ddterm_extension(self, shell_dbus_api, ddterm_metadata):
        return shell_dbus_api.enable_extension(
            ddterm_metadata['uuid'],
            timeout=self.START_STOP_TIMEOUT_MS
        )

    @pytest.fixture(scope='class')
    def ddterm_extension_info(self, enable_ddterm_extension):
        return enable_ddterm_extension

    @pytest.fixture(scope='class')
    def ddterm_extension_interface(self, user_bus_connection, enable_ddterm_extension):
        return dbus_util.wait_interface(
            user_bus_connection,
            name='org.gnome.Shell',
            path='/org/gnome/Shell/Extensions/ddterm',
            interface='com.github.amezin.ddterm.Extension',
            timeout=self.START_STOP_TIMEOUT_MS
        )

    @pytest.fixture(scope='class')
    def enable_test_extension(self, shell_dbus_api, test_metadata, enable_ddterm_extension):
        return shell_dbus_api.enable_extension(
            test_metadata['uuid'],
            timeout=self.START_STOP_TIMEOUT_MS
        )

    @pytest.fixture(scope='class')
    def test_extension_info(self, enable_test_extension):
        return enable_test_extension

    @pytest.fixture(scope='class')
    def test_extension_interface(self, user_bus_connection, enable_test_extension, log_sync):
        iface = dbus_util.wait_interface(
            user_bus_connection,
            name='org.gnome.Shell',
            path='/org/gnome/Shell/Extensions/ddterm',
            interface='com.github.amezin.ddterm.ExtensionTest',
            timeout=self.START_STOP_TIMEOUT_MS
        )

        def trace_signal(proxy, sender, signal, params):
            LOGGER.info('%s %r', signal, params.unpack())

        def trace_props(proxy, changed, invalidated):
            for prop in changed.keys():
                LOGGER.info('%s = %r', prop, changed[prop])

            for prop in invalidated:
                LOGGER.info('%s invalidated', prop)

        with log_sync.with_registered(SyncMessageDBus(iface)):
            with glib_util.SignalConnection(iface, 'g-signal', trace_signal):
                with glib_util.SignalConnection(iface, 'g-properties-changed', trace_props):
                    yield iface

    @pytest.fixture(autouse=True)
    def check_log_errors(self, caplog, container, syslog_server, ddterm_metadata):
        uuid = ddterm_metadata['uuid']
        paths = [
            container.extensions_system_install_path() / uuid,
            container.extensions_user_install_path(timeout=self.START_STOP_TIMEOUT_SEC) / uuid
        ]
        patterns = [f'@{path}' for path in paths]

        yield

        all_records = itertools.chain(
            caplog.get_records('setup'),
            caplog.get_records('call'),
            caplog.get_records('teardown')
        )

        errors = [
            record for record in all_records
            if record.levelno >= logging.WARNING
            and record.name.startswith(syslog_server.logger.name)
            and any(pattern in record.message for pattern in patterns)
        ]

        assert errors == []
