import contextlib
import logging

from gi.repository import GLib, Gio


LOGGER = logging.getLogger(__name__)


@contextlib.contextmanager
def signal_handler(source, signal, handler):
    handler_id = source.connect(signal, handler)

    try:
        yield handler_id

    finally:
        source.disconnect(handler_id)


@contextlib.contextmanager
def timeout_source(timeout_ms, callback, *data, context=None):
    source = GLib.timeout_source_new(timeout_ms)
    source.set_callback(callback, *data)
    source.attach(context)

    try:
        yield source

    finally:
        source.destroy()


def wait_event(timeout_ms, context=None):
    if context is None:
        context = GLib.MainContext.get_thread_default()

    if context is None:
        context = GLib.MainContext.default()

    acquired = context.acquire()

    if not acquired:
        raise Exception('Cannot acquire context')

    try:
        with timeout_source(timeout_ms, lambda *_: GLib.SOURCE_REMOVE, context=context):
            context.iteration(True)

        while context.iteration(False):
            pass

    finally:
        context.release()


def process_pending_events(context=None):
    if context is None:
        context = GLib.MainContext.get_thread_default()

    if context is None:
        context = GLib.MainContext.default()

    acquired = context.acquire()

    if not acquired:
        raise Exception('Cannot acquire context')

    try:
        while context.iteration(False):
            pass

    finally:
        context.release()


@contextlib.contextmanager
def timeout_cancellable(timeout_ms, context=None):
    cancellable = Gio.Cancellable.new()

    def callback(*_):
        LOGGER.warning('Timeout triggered after %s ms', timeout_ms)
        cancellable.cancel()
        return GLib.SOURCE_REMOVE

    try:
        with timeout_source(timeout_ms, callback, context=context):
            yield cancellable

    finally:
        cancellable.cancel()


def wait_init(initable, timeout, io_priority=GLib.PRIORITY_DEFAULT):
    task = Gio.Task()
    context = task.get_context()
    loop = GLib.MainLoop.new(context, False)

    def callback(source, result, *_):
        try:
            task.return_value(source.init_finish(result))
        except GLib.Error as ex:
            task.return_error(ex)
        finally:
            loop.quit()

    with timeout_cancellable(timeout, context=context) as cancellable:
        initable.init_async(io_priority, cancellable, callback)
        loop.run()

    ok, result = task.propagate_value()

    assert ok
    assert result


class Deadline:
    def __init__(self, timeout_ms):
        self.deadline_us = GLib.get_monotonic_time() + timeout_ms * 1000

    @property
    def remaining_us(self):
        return max(0, self.deadline_us - GLib.get_monotonic_time())

    @property
    def remaining_ms(self):
        return self.remaining_us // 1000

    def check_remaining_ms(self):
        remaining_us = self.deadline_us - GLib.get_monotonic_time()

        if remaining_us < 0:
            raise TimeoutError()

        return remaining_us // 1000

    def source(self, callback, *data, context=None):
        return timeout_source(self.remaining_ms, callback, *data, context=context)

    def cancellable(self, context=None):
        return timeout_cancellable(self.remaining_ms, context=context)
