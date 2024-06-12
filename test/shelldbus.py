import json
import logging
import pathlib

from . import dbusutil, glibutil


LOGGER = logging.getLogger(__name__)

BUS_NAME = 'org.gnome.Shell'
OBJECT_PATH = '/org/gnome/Shell'
INTERFACE_NAME = 'org.gnome.Shell'

THIS_FILE = pathlib.Path(__file__).resolve()
THIS_DIR = THIS_FILE.parent
INTROSPECT_FILE = THIS_DIR / 'dbus-interfaces' / f'{INTERFACE_NAME}.xml'


class _Base(dbusutil.Proxy):
    __dbus_interface_info__ = INTROSPECT_FILE.read_text()


class Proxy(_Base):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, g_name=BUS_NAME, g_object_path=OBJECT_PATH, **kwargs)

    @property
    def ShellVersion(self):
        return tuple(int(part) for part in super().ShellVersion.split('.'))

    def Eval(self, code, **kwargs):
        success, result = super().Eval(code,  **kwargs)

        if success is not True:
            raise Exception(result)

        if not result:
            return None

        return json.loads(result)

    def terminate(self, timeout=None):
        if timeout is None:
            timeout = self.get_default_timeout()

        if self.is_connected():
            deadline = glibutil.Deadline(timeout)
            self.Eval('global.context.terminate()', timeout=timeout)
            self.wait_property('g-name-owner', None, timeout=deadline.remaining_ms)