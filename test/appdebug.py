import json
import logging
import pathlib

from . import dbusutil, glibutil


LOGGER = logging.getLogger(__name__)

BUS_NAME = 'com.github.amezin.ddterm'
OBJECT_PATH = '/com/github/amezin/ddterm'
INTERFACE_NAME = 'com.github.amezin.ddterm.Debug'

THIS_FILE = pathlib.Path(__file__).resolve()
THIS_DIR = THIS_FILE.parent
INTROSPECT_FILE = THIS_DIR / 'dbus-interfaces' / f'{INTERFACE_NAME}.xml'


class _Base(dbusutil.Proxy):
    __dbus_interface_info__ = INTROSPECT_FILE.read_text()


class Proxy(_Base):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, g_name=BUS_NAME, g_object_path=OBJECT_PATH, **kwargs)

        self.reset_size_allocations()

        self.connect('SizeAllocate', Proxy._record_size_allocate)

    def Eval(self, code, **kwargs):
        result = super().Eval(code, **kwargs)

        return json.loads(result) if result else None

    def WaitFrame(self, **kwargs):
        super().WaitFrame(**kwargs)
        glibutil.process_pending_events()

    def DumpHeap(self, path, **kwargs):
        return super().DumpHeap(str(path), **kwargs)

    def _record_size_allocate(self, width, height):
        size = width, height

        if not self.size_allocations or self.size_allocations[-1] != size:
            self.size_allocations.append(size)

    def reset_size_allocations(self):
        self.size_allocations = []
