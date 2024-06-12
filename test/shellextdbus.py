import enum
import logging
import pathlib

from . import dbusutil, glibutil


LOGGER = logging.getLogger(__name__)

BUS_NAME = 'org.gnome.Shell'
OBJECT_PATH = '/org/gnome/Shell'
INTERFACE_NAME = 'org.gnome.Shell.Extensions'

THIS_FILE = pathlib.Path(__file__).resolve()
THIS_DIR = THIS_FILE.parent
INTROSPECT_FILE = THIS_DIR / 'dbus-interfaces' / f'{INTERFACE_NAME}.xml'


@enum.unique
class ExtensionState(enum.IntEnum):
    ACTIVE = 1
    INACTIVE = 2
    ERROR = 3
    OUT_OF_DATE = 4
    DOWNLOADING = 5
    INITIALIZED = 6
    DEACTIVATING = 7
    ACTIVATING = 8
    UNINSTALLED = 99


class _Base(dbusutil.Proxy):
    __dbus_interface_info__ = INTROSPECT_FILE.read_text()


class Proxy(_Base):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, g_name=BUS_NAME, g_object_path=OBJECT_PATH, **kwargs)

        self.extension_state = dict()

        self.connect('ExtensionStateChanged', Proxy._update_extension_state)

    @classmethod
    def create(cls, **kwargs):
        obj = super().create(**kwargs)
        obj.ListExtensions()

        return obj

    def _update_extension_state(self, uuid, state):
        prev = self.extension_state.get(uuid, None)
        state = state.unpack()

        if state != prev:
            self.extension_state[uuid] = state

    def ListExtensions(self, timeout=None):
        new_state = super().ListExtensions(timeout=timeout)

        for i in range(new_state.n_children()):
            entry = new_state.get_child_value(i)
            uuid = entry.get_child_value(0).get_string()
            data = entry.get_child_value(1)

            self._update_extension_state(uuid, data)

        return self.extension_state

    def EnableExtension(self, uuid, timeout=None):
        if timeout is None:
            timeout = self.get_default_timeout()

        deadline = glibutil.Deadline(timeout)

        super().EnableExtension(uuid, timeout=timeout)

        glibutil.process_pending_events()

        while self.extension_state.get(uuid, dict()).get('state', None) in [
            None,
            ExtensionState.INACTIVE,
            ExtensionState.INITIALIZED,
            ExtensionState.ACTIVATING,
        ]:
            glibutil.wait_event(timeout_ms=deadline.check_remaining_ms())

        extension_state = self.extension_state[uuid]
        state = ExtensionState(extension_state['state'])

        if state == ExtensionState.ACTIVE:
            return extension_state

        errors = self.GetExtensionErrors(uuid, timeout=deadline.remaining_ms)

        if errors:
            raise Exception(errors)

        error = extension_state.get('error')

        if error:
            raise Exception(error)

        raise Exception(f'Invalid extension state: {state!r}')
