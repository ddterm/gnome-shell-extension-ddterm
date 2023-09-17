from gi.repository import GLib

from . import dbus_util, glib_util


class GnomeShellDBusApi:
    def __init__(self, connection, timeout):
        deadline = GLib.get_monotonic_time() // 1000 + timeout

        self.shell_interface = dbus_util.wait_interface(
            connection,
            name='org.gnome.Shell',
            path='/org/gnome/Shell',
            interface='org.gnome.Shell',
            timeout=timeout
        )

        self.extensions_interface = dbus_util.wait_interface(
            connection,
            name='org.gnome.Shell',
            path='/org/gnome/Shell',
            interface='org.gnome.Shell.Extensions',
            timeout=max(0, deadline - GLib.get_monotonic_time() // 1000)
        )

    def get_extension_info(self, uuid, timeout=None):
        if timeout is None:
            timeout = self.extensions_interface.get_default_timeout()

        return self.extensions_interface.GetExtensionInfo('(s)', uuid, timeout=timeout)

    def enable_extension(self, uuid, timeout=None):
        if timeout is None:
            timeout = self.extensions_interface.get_default_timeout()

        deadline = GLib.get_monotonic_time() // 1000 + timeout
        info = None

        with glib_util.SignalWait(
            source=self.extensions_interface,
            signal='g-signal',
            timeout=timeout
        ) as g_signal:
            self.extensions_interface.EnableExtension(
                '(s)',
                uuid,
                timeout=timeout
            )

            while True:
                info = self.get_extension_info(
                    uuid,
                    timeout=max(0, deadline - GLib.get_monotonic_time() // 1000)
                )

                if info:
                    break

                g_signal.wait()

        assert info['error'] == ''
        assert info['state'] == 1

        return info

    @property
    def version(self):
        version_str = self.extensions_interface.get_cached_property('ShellVersion').unpack()

        return tuple(
            int(x) if x.isdecimal() else x
            for x in version_str.split('.')
        )

    @property
    def overview_active(self):
        return self.shell_interface.get_cached_property('OverviewActive').unpack()

    def set_overview_active(self, value, timeout=None):
        if timeout is None:
            timeout = self.shell_interface.get_default_timeout()

        with glib_util.SignalWait(
            source=self.shell_interface,
            signal='g-properties-changed',
            timeout=timeout
        ) as wait:
            dbus_util.set_property(
                self.shell_interface,
                'OverviewActive',
                value,
                timeout=timeout
            )

            while self.overview_active != value:
                wait.wait()
