import logging

from gi.repository import GLib, Gio


LOGGER = logging.getLogger(__name__)


def call(connection, method, signature=None, *args, dest, path, interface, return_type=None, timeout=None):
    return connection.call_sync(
        dest,
        path,
        interface,
        method,
        GLib.Variant(signature, args) if signature or args else None,
        GLib.VariantType.new(return_type) if return_type else None,
        Gio.DBusCallFlags.NONE,
        -1 if timeout is None else int(timeout * 1000),
        None
    ).unpack()


class OneShotTimer:
    def __init__(self):
        self.source = None

    def cancel(self, *_):
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


def wait_interface(connection, name, path, interface):
    loop = GLib.MainLoop.new(None, False)
    retry = OneShotTimer()
    interface_info = None

    def introspect(connection, name, owner):
        LOGGER.info('Calling Introspect() on destination %r, path %r', owner, path)
        try:
            (data,) = call(connection, 'Introspect', return_type='(s)', dest=owner, path=path, interface='org.freedesktop.DBus.Introspectable')
            LOGGER.info('Introspect() call succeeded on destination %r, path %r', owner, path)

            nonlocal interface_info
            node_info = Gio.DBusNodeInfo.new_for_xml(data)
            interface_info = node_info.lookup_interface(interface)

            if interface_info:
                loop.quit()
                return
            else:
                LOGGER.info('Interface %r not found in Introspect() results on destination %r, path %r', interface, owner, path)

        except GLib.Error:
            LOGGER.exception('Introspect() call failed on destination %r, path %r', owner, path)

        retry.schedule(50, lambda *_: introspect(connection, name, owner))

    watch_id = Gio.bus_watch_name_on_connection(
        connection,
        name,
        Gio.BusNameWatcherFlags.NONE,
        introspect,
        retry.cancel
    )

    try:
        loop.run()

        return Gio.DBusProxy.new_sync(
            connection,
            Gio.DBusProxyFlags.GET_INVALIDATED_PROPERTIES,
            interface_info,
            name,
            path,
            interface,
            None
        )

    finally:
        Gio.bus_unwatch_name(watch_id)
        retry.cancel()


def connect_tcp(host, port):
    return Gio.DBusConnection.new_for_address_sync(
        f'tcp:host={host},port={port}',
        Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT | Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION,
        None,
        None
    )
