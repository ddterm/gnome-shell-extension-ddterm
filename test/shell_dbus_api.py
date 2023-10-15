import enum

from gi.repository import GLib

from . import dbus_util, glib_util


# https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/misc/extensionUtils.js
class ExtensionState(enum.IntEnum):
    ENABLED = 1
    DISABLED = 2
    ERROR = 3
    OUT_OF_DATE = 4
    DOWNLOADING = 5
    INITIALIZED = 6
    DISABLING = 7
    ENABLING = 8


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

                state = info.get('state') if info else None

                if state not in [None, ExtensionState.ENABLING, ExtensionState.INITIALIZED]:
                    break

                g_signal.wait()

        errors = self.extensions_interface.GetExtensionErrors(
            '(s)',
            uuid,
            timeout=max(0, deadline - GLib.get_monotonic_time() // 1000)
        )

        if errors:
            errors = "\n\n".join(errors)
            raise Exception(f'Errors when enabling extension {uuid!r}: {errors}')

        error = info['error']

        if error:
            raise Exception(f'Error when enabling extension {uuid!r}: {error}')

        state = ExtensionState(info['state'])

        if state != ExtensionState.ENABLED:
            raise Exception(f'Invalid extension {uuid!r} state {state!r}')

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
