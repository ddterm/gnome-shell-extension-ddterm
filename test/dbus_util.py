import logging

from gi.repository import GLib, Gio


LOGGER = logging.getLogger(__name__)

INTROSPECTABLE_IFACE = Gio.DBusNodeInfo.new_for_xml('''
    <!DOCTYPE node PUBLIC "-//freedesktop//DTD D-BUS Object Introspection 1.0//EN"
        "http://www.freedesktop.org/standards/dbus/1.0/introspect.dtd">
    <node>
        <interface name="org.freedesktop.DBus.Introspectable">
            <method name="Introspect">
                <arg type="s" name="xml_data" direction="out"/>
            </method>
        </interface>
    </node>
''').interfaces[0]


class OneShotTimer:
    def __init__(self):
        self.source = None

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


def wait_interface(connection, name, path, interface):
    introspectable = Gio.DBusProxy.new_sync(
        connection,
        Gio.DBusProxyFlags.DO_NOT_LOAD_PROPERTIES,
        INTROSPECTABLE_IFACE,
        name,
        path,
        INTROSPECTABLE_IFACE.name,
        None
    )

    loop = GLib.MainLoop.new(None, False)
    retry = OneShotTimer()
    interface_info = None

    def introspect_result(source, result):
        owner = introspectable.get_name_owner()

        try:
            (data,) = source.call_finish(result).unpack()
            node_info = Gio.DBusNodeInfo.new_for_xml(data)

        except GLib.Error:
            LOGGER.exception(
                'Introspect() call failed on destination %r, path %r',
                owner,
                path
            )

            retry.schedule(50, introspect)
            return

        nonlocal interface_info
        interface_info = node_info.lookup_interface(interface)

        LOGGER.info(
            'Interface %r %s on destination %r, path %r',
            interface,
            'found' if interface_info else 'not found',
            owner,
            path
        )

        if interface_info:
            loop.quit()
        else:
            retry.schedule(50, introspect)

    cancellable = None

    def introspect(*_):
        retry.cancel()

        nonlocal cancellable
        if cancellable:
            cancellable.cancel()

        owner = introspectable.get_name_owner()
        if not owner:
            LOGGER.info('No name owner for %r', name)
            return

        LOGGER.info('Calling Introspect() on destination %r, path %r', owner, path)

        cancellable = Gio.Cancellable()

        introspectable.call(
            'Introspect',
            None,
            Gio.DBusCallFlags.NONE,
            -1,
            cancellable,
            introspect_result
        )

    watch_id = introspectable.connect('notify::g-name-owner', introspect)

    try:
        introspect()

        if not interface_info:
            loop.run()

        return Gio.DBusProxy.new_sync(
            connection,
            Gio.DBusProxyFlags.GET_INVALIDATED_PROPERTIES,
            interface_info,
            introspectable.get_name_owner(),
            path,
            interface,
            None
        )

    finally:
        introspectable.disconnect(watch_id)
        retry.cancel()


def connect_tcp(host, port):
    return Gio.DBusConnection.new_for_address_sync(
        f'tcp:host={host},port={port}',
        Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT | Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION,
        None,
        None
    )
