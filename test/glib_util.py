import collections
import contextlib

from gi.repository import GLib


def flush_main_loop():
    loop = GLib.MainLoop()

    def idle_quit(*_):
        loop.quit()
        return GLib.SOURCE_REMOVE

    GLib.idle_add(idle_quit)
    loop.run()


class OneShotTimer(contextlib.AbstractContextManager):
    def __init__(self):
        super().__init__()
        self.source = None

    @property
    def active(self):
        return self.source is not None

    def cancel(self):
        if self.source is not None:
            self.source.destroy()
            self.source = None

    def schedule(self, timeout, callback, context=None):
        self.cancel()

        def handler(*_):
            self.source = None
            callback()
            return GLib.SOURCE_REMOVE

        self.source = GLib.timeout_source_new(timeout)
        self.source.set_callback(handler)
        self.source.attach(context)

    def __exit__(self, *_):
        self.cancel()


class SignalConnection(contextlib.AbstractContextManager):
    def __init__(self, source, signal, handler):
        super().__init__()
        self.source = source
        self.handler_id = source.connect(signal, handler)

    def disconnect(self):
        if self.handler_id is not None:
            self.source.disconnect(self.handler_id)
            self.handler_id = None

    def __exit__(self, *_):
        self.disconnect()


class SignalWait(SignalConnection):
    def __init__(self, source, signal):
        super().__init__(source, signal, self.handler)
        self.emissions = collections.deque()
        self.loop = GLib.MainLoop()

    def handler(self, *args):
        self.emissions.append(args)
        self.loop.quit()

    def disconnect(self):
        super().disconnect()
        self.loop.quit()

    def wait(self):
        while not self.emissions and self.handler_id is not None:
            self.loop.run()

        return self.emissions.popleft() if self.emissions else None

    def __iter__(self):
        return self

    def __next__(self):
        result = self.wait()

        if result is None:
            raise StopIteration()

        return result
