import functools

from gi.repository import GLib

from . import dbus_util, glib_util


STARTUP_TIMEOUT_SEC = 15
STARTUP_TIMEOUT_MS = STARTUP_TIMEOUT_SEC * 1000


class GnomeShellDBusApi:
    def __init__(self, connection):
        self.connection = connection

    @functools.cached_property
    def shell_interface(self):
        return dbus_util.wait_interface(
            self.connection,
            name='org.gnome.Shell',
            path='/org/gnome/Shell',
            interface='org.gnome.Shell',
            timeout=STARTUP_TIMEOUT_MS
        )

    @functools.cached_property
    def extensions_interface(self):
        return dbus_util.wait_interface(
            self.connection,
            name='org.gnome.Shell',
            path='/org/gnome/Shell',
            interface='org.gnome.Shell.Extensions',
            timeout=STARTUP_TIMEOUT_MS
        )

    def enable_extension(self, uuid):
        info = None

        with glib_util.SignalWait(
            source=self.extensions_interface,
            signal='g-signal',
            timeout=STARTUP_TIMEOUT_MS
        ) as g_signal:
            self.extensions_interface.EnableExtension('(s)', uuid, timeout=STARTUP_TIMEOUT_MS)

            while True:
                info = self.extensions_interface.GetExtensionInfo(
                    '(s)', uuid, timeout=STARTUP_TIMEOUT_MS
                )

                if info:
                    break

                g_signal.wait()

        assert info['error'] == ''
        assert info['state'] == 1

    @functools.cached_property
    def version(self):
        version_str = self.extensions_interface.get_cached_property('ShellVersion').unpack()

        return tuple(
            int(x) if x.isdecimal() else x
            for x in version_str.split('.')
        )

    @property
    def overview_active(self):
        return self.shell_interface.get_cached_property('OverviewActive').unpack()

    def set_overview_active(self, value):
        with glib_util.SignalWait(
            source=self.shell_interface,
            signal='g-properties-changed',
            timeout=STARTUP_TIMEOUT_MS
        ) as wait:
            dbus_util.set_property(
                self.shell_interface,
                'OverviewActive',
                value,
                timeout=STARTUP_TIMEOUT_MS
            )

            while self.overview_active != value:
                wait.wait()
