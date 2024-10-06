import json
import logging
import pathlib

from gi.repository import GObject

from . import dbusutil, geometry, glibutil


LOGGER = logging.getLogger(__name__)

THIS_FILE = pathlib.Path(__file__).resolve()
THIS_DIR = THIS_FILE.parent
JS_FILE = THIS_DIR / 'extensionhook.js'

BUS_NAME = 'org.gnome.Shell'
OBJECT_PATH = '/org/gnome/Shell/Extensions/ddterm/TestHook'
INTERFACE_NAME = 'com.github.amezin.ddterm.TestHook'
INTROSPECT_FILE = THIS_DIR / 'dbus-interfaces' / f'{INTERFACE_NAME}.xml'


class _Base(dbusutil.Proxy):
    __dbus_interface_info__ = INTROSPECT_FILE.read_text()


def _discard_pspec(func):
    return lambda self, pspec: func(self)


class Proxy(_Base):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, g_name=BUS_NAME, g_object_path=OBJECT_PATH, **kwargs)

        self.reset_seen_transitions()

        self.connect('notify::HasWindow', _discard_pspec(Proxy.reset_seen_transitions))
        self.connect('notify::Transitions', _discard_pspec(Proxy._snapshot_transitions))
        self.connect('notify::WindowRect', _discard_pspec(Proxy._snapshot_window_rect))
        self.connect('notify::HasWindow', _discard_pspec(Proxy.reset_window_rect_snapshots))
        self.connect(
            'notify::RenderedFirstFrame',
            _discard_pspec(Proxy.reset_window_rect_snapshots)
        )

    @classmethod
    def create(cls, shell_hook, timeout=None):
        if timeout is None:
            timeout = shell_hook.get_default_timeout()

        deadline = glibutil.Deadline(timeout)

        shell_hook.Eval(
            f'import({json.dumps(JS_FILE.as_uri())}).then(m => m.init())',
            timeout=timeout,
        )

        proxy = super().create(
            g_connection=shell_hook.get_connection(),
            timeout=deadline.remaining_ms,
            g_default_timeout=timeout,
        )

        return proxy

    @GObject.Property(flags=GObject.ParamFlags.READABLE)
    def WindowRect(self):
        variant = super().WindowRect

        if variant is None:
            return None

        return geometry.Rect.parse_variant(variant)

    @GObject.Property(flags=GObject.ParamFlags.READABLE)
    def Transitions(self):
        strv = super().Transitions

        if strv is None:
            return None

        return set(strv)

    def _snapshot_transitions(self):
        if self.Transitions:
            self.seen_transitions |= self.Transitions

    def reset_seen_transitions(self):
        self.seen_transitions = set()
        self._snapshot_transitions()

    def _snapshot_window_rect(self):
        if not self.HasWindow or not self.RenderedFirstFrame:
            return

        current = self.WindowRect

        if not current:
            return

        if current.width == 0 and current.height == 0:
            return

        prev = None

        if self.window_rect_snapshots:
            prev = self.window_rect_snapshots[-1]

        if prev != current:
            self.window_rect_snapshots.append(current)

    def reset_window_rect_snapshots(self):
        self.window_rect_snapshots = []
        self._snapshot_window_rect()

    def Destroy(self, **kwargs):
        if self.is_connected():
            super().Destroy(**kwargs)
