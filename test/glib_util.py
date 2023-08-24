import collections
import contextlib

from gi.repository import GLib, Gio


def flush_main_loop():
    loop = GLib.MainLoop.new(GLib.MainContext.get_thread_default(), False)

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
        if context is None:
            context = GLib.MainContext.get_thread_default()

        self.cancel()

        def handler(*_):
            self.source = None
            callback()
            return GLib.SOURCE_REMOVE

        self.source = GLib.timeout_source_new(max(0, timeout))
        self.source.set_callback(handler)
        self.source.attach(context)

    def __exit__(self, *_):
        self.cancel()


def sleep(time_ms):
    loop = GLib.MainLoop.new(GLib.MainContext.get_thread_default(), False)

    with OneShotTimer() as timer:
        timer.schedule(time_ms, loop.quit)
        loop.run()


def busy_wait(interval_ms, timeout_ms):
    timed_out = False
    loop = GLib.MainLoop.new(GLib.MainContext.get_thread_default(), False)

    def on_timeout():
        nonlocal timed_out
        timed_out = True
        loop.quit()

    with OneShotTimer() as timeout_timer:
        timeout_timer.schedule(timeout_ms, on_timeout)

        with OneShotTimer() as interval_timer:
            while not timed_out:
                yield
                interval_timer.schedule(interval_ms, loop.quit)
                loop.run()

    if timed_out:
        raise TimeoutError()


class SignalConnection(contextlib.AbstractContextManager):
    def __init__(self, source, signal, handler):
        super().__init__()
        self.source = source
        self.signal = signal
        self.handler_id = source.connect(signal, handler)

    def disconnect(self):
        if self.handler_id is not None:
            self.source.disconnect(self.handler_id)
            self.handler_id = None

    def __exit__(self, *_):
        self.disconnect()


class SignalWait(SignalConnection):
    DEFAULT_TIMEOUT_MS = 1000

    def __init__(self, source, signal, timeout=DEFAULT_TIMEOUT_MS):
        super().__init__(source, signal, self.handler)
        self.emissions = collections.deque()
        self.loop = GLib.MainLoop.new(GLib.MainContext.get_thread_default(), False)
        self.timer = OneShotTimer()
        self.timed_out = False

        if timeout is not None:
            def timeout_handler():
                self.timed_out = True
                self.loop.quit()

            self.timer.schedule(timeout, timeout_handler)

    def handler(self, *args):
        self.emissions.append(args)
        self.loop.quit()

    def disconnect(self):
        super().disconnect()
        self.loop.quit()

    def wait(self):
        while not self.emissions and self.handler_id is not None and not self.timed_out:
            self.loop.run()

        if self.emissions:
            return self.emissions.popleft()

        if self.timed_out:
            raise TimeoutError(f'Timed out waiting for signal {self.signal!r} on {self.source!r}')

    def __iter__(self):
        return self

    def __next__(self):
        result = self.wait()

        if result is None:
            raise StopIteration()

        return result


class SyncCall:
    def __init__(self):
        self.loop = GLib.MainLoop.new(GLib.MainContext.get_thread_default(), False)
        self.cancellable = Gio.Cancellable()
        self.result = None
        self.exception = None
        self.done = False

    def set_result(self, result):
        assert not self.done

        self.result = result
        self.done = True
        self.loop.quit()

    def set_exception(self, exception):
        assert not self.done

        if self.exception is not None:
            assert isinstance(exception, GLib.Error)
            assert exception.matches(Gio.io_error_quark(), Gio.IOErrorEnum.CANCELLED)

        else:
            self.exception = exception

        self.done = True
        self.loop.quit()

    def time_out(self):
        if self.exception is None:
            self.exception = TimeoutError()

        self.cancellable.cancel()

    def run(self, timeout=None):
        try:
            with OneShotTimer() as timer:
                if timeout is not None:
                    timer.schedule(timeout, self.time_out)

                self.loop.run()

        finally:
            if not self.done:
                self.cancellable.cancel()

            if not self.done:
                self.loop.run()

        if self.exception:
            raise self.exception

        return self.result
