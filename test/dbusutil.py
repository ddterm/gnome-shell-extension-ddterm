import logging

from gi.repository import GLib, Gio

from . import dbusproxy, dbustrace, glibutil


LOGGER = logging.getLogger(__name__)

DEFAULT_TIMEOUT_MS = 10_000


def connect(address, timeout=DEFAULT_TIMEOUT_MS):
    LOGGER.info('Connecting to D-Bus address %r', address)

    task = Gio.Task()
    context = task.get_context()
    loop = GLib.MainLoop.new(context, False)

    def callback(source, result):
        try:
            task.return_value(Gio.DBusConnection.new_finish(result))
            LOGGER.info('Connected to D-Bus at address %r', address)

        except GLib.Error as ex:
            LOGGER.exception('Failed to connect to D-Bus at %r', address)
            task.return_error(ex)

        finally:
            loop.quit()

    with glibutil.timeout_cancellable(timeout, context=context) as cancellable:
        Gio.DBusConnection.new_for_address(
            address,
            (
                Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION |
                Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT
            ),
            None,
            cancellable,
            callback
        )

        loop.run()

    _, bus = task.propagate_value()

    bus.add_filter(dbustrace.filter)

    return bus


def close(connection, timeout=DEFAULT_TIMEOUT_MS):
    LOGGER.info('Disconnecting from D-Bus')

    context = GLib.MainContext.new()
    loop = GLib.MainLoop.new(context, False)

    def close_callback(source, result):
        try:
            source.close_finish(result)
            LOGGER.info('Disconnected from D-Bus')

        except GLib.Error:
            LOGGER.exception('Failed to close D-Bus connection')

        finally:
            loop.quit()

    context.push_thread_default()

    try:
        with glibutil.timeout_cancellable(timeout, context=context) as cancellable:
            connection.close(cancellable, close_callback)
            loop.run()

    finally:
        context.pop_thread_default()


def wait_name(connection, name, timeout=DEFAULT_TIMEOUT_MS, autostart=False):
    context = GLib.MainContext.new()
    loop = GLib.MainLoop.new(context, False)
    flags = Gio.BusNameWatcherFlags.NONE
    name_owner = None

    if autostart:
        flags |= Gio.BusNameWatcherFlags.AUTO_START

    def appeared(connection, name, owner):
        nonlocal name_owner
        name_owner = owner

        LOGGER.info('Bus name %r appeared on D-Bus: %r', name, owner)
        loop.quit()

    context.push_thread_default()

    try:
        LOGGER.info('Waiting for bus name %r', name)

        watch_id = Gio.bus_watch_name_on_connection(
            connection,
            name,
            flags,
            appeared,
            None
        )

        try:
            with glibutil.timeout_cancellable(timeout, context=context) as cancellable:
                cancellable.connect(lambda *_: loop.quit())
                loop.run()

                if cancellable.is_cancelled():
                    raise TimeoutError()

        finally:
            Gio.bus_unwatch_name(watch_id)

    finally:
        context.pop_thread_default()

    return name_owner


def _proxy_property_trace(proxy, pspec):
    prop_name = pspec.name

    LOGGER.info('%r: %s = %r', proxy, prop_name, proxy.get_property(prop_name))


class Proxy(dbusproxy.Proxy):
    @classmethod
    def create(cls, *, timeout=DEFAULT_TIMEOUT_MS, g_flags=None, **kwargs):
        kwargs.setdefault('g_flags', cls.G_FLAGS_DEFAULT | Gio.DBusProxyFlags.DO_NOT_AUTO_START)
        kwargs.setdefault('g_default_timeout', timeout)

        obj = cls(**kwargs)
        glibutil.wait_init(obj, timeout)

        return obj

    def __init__(self, *args, **kwargs):
        kwargs.setdefault('g_default_timeout', DEFAULT_TIMEOUT_MS)

        super().__init__(*args, **kwargs)

        self.connect('notify', _proxy_property_trace)

    def is_connected(self):
        return self.get_name_owner() and not self.get_connection().is_closed()

    def ensure_connected(self):
        if not self.get_name_owner():
            raise GLib.Error.new_literal(
                Gio.DBusError.quark(),
                'No name owner',
                Gio.DBusError.NAME_HAS_NO_OWNER,
            )

        if self.get_connection().is_closed():
            raise GLib.Error.new_literal(
                Gio.DBusError.quark(),
                'Disconnected',
                Gio.DBusError.DISCONNECTED,
            )

    def wait_property(self, name, value, timeout=None):
        # Make sure the cached value is up to date, avoid false match
        glibutil.process_pending_events()

        if self.get_cached_property(name) == value or self.get_property(name) == value:
            return

        LOGGER.info('%r: waiting for %r value to become %r', self, name, value)

        if timeout is None:
            timeout = self.get_default_timeout()

        deadline = glibutil.Deadline(timeout)

        while self.get_cached_property(name) != value and self.get_property(name) != value:
            self.ensure_connected()

            glibutil.wait_event(timeout_ms=deadline.check_remaining_ms())

    def set_dbus_property(
        self,
        name,
        value,
        flags=Gio.DBusCallFlags.NONE,
        timeout=None,
    ):
        try:
            if timeout is None:
                timeout = self.get_default_timeout()

            deadline = glibutil.Deadline(timeout)
            task = Gio.Task()
            loop = GLib.MainLoop.new(task.get_context(), False)

            def callback(source, result, *_):
                try:
                    task.return_value(source.set_dbus_property_finish(result))
                except GLib.Error as ex:
                    task.return_error(ex)
                finally:
                    loop.quit()

            super().set_dbus_property(
                name=name,
                value=value,
                flags=flags,
                timeout=timeout,
                callback=callback,
            )

            loop.run()
            task.propagate_value()

            self.wait_property(name=name, value=value, timeout=deadline.remaining_ms)

        except Exception:
            LOGGER.exception('%r: cannot set property %r to %r', self, name, value)
