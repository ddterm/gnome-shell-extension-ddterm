import logging

import pytest

from . import gnome_container, log_sync
from .shell_dbus_api import GnomeShellDBusApi


LOGGER = logging.getLogger(__name__)


class SyncMessageSystemdCat:
    def __init__(self, container):
        self.container = container

    @log_sync.hookimpl
    def log_sync_message(self, msg):
        try:
            self.container.journal_message(msg)
            return True

        except Exception:
            LOGGER.exception("Can't send syslog message with systemd-cat")


class ContainerFixtures:
    START_STOP_TIMEOUT_SEC = 15
    START_STOP_TIMEOUT_MS = START_STOP_TIMEOUT_SEC * 1000

    GNOME_SHELL_SESSION_NAME = 'gnome-session-x11'
    ENABLE_WELCOME_DIALOG = False

    @pytest.fixture(scope='class')
    def container(
        self,
        podman,
        container_image,
        container_volumes,
        syslog_server,
        container_create_lock,
        log_sync
    ):
        with container_create_lock:
            c = gnome_container.GnomeContainer(
                podman,
                container_image,
                volumes=container_volumes,
                syslog_server=syslog_server,
                timeout=self.START_STOP_TIMEOUT_SEC
            )

        try:
            c.start(timeout=self.START_STOP_TIMEOUT_SEC)

            with log_sync.with_registered(SyncMessageSystemdCat(c)):
                c.wait_system_running(timeout=self.START_STOP_TIMEOUT_SEC)
                yield c

        finally:
            c.rm(timeout=self.START_STOP_TIMEOUT_SEC)

    def configure_session(self, container, request):
        if not self.ENABLE_WELCOME_DIALOG:
            container.disable_welcome_dialog(timeout=self.START_STOP_TIMEOUT_SEC)

    @pytest.fixture(scope='class')
    def gnome_shell_session(self, container, request):
        self.configure_session(container, request)
        container.start_session(self.GNOME_SHELL_SESSION_NAME, timeout=self.START_STOP_TIMEOUT_SEC)
        return self.GNOME_SHELL_SESSION_NAME

    @pytest.fixture(scope='class')
    def user_bus_connection(self, container):
        connection = container.connect_user_bus(timeout=self.START_STOP_TIMEOUT_SEC)
        yield connection
        connection.close()

    @pytest.fixture(scope='class')
    def shell_dbus_api(self, user_bus_connection, gnome_shell_session):
        return GnomeShellDBusApi(user_bus_connection, timeout=self.START_STOP_TIMEOUT_MS)

    @pytest.fixture(scope='class')
    def x11_display(self, container):
        display = container.connect_x11_display(timeout=self.START_STOP_TIMEOUT_SEC)
        yield display
        display.close()
