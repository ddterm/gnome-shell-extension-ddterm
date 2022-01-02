import logging

from gi.repository import GLib, Gio


LOGGER = logging.getLogger(__name__)

TEST_DBUS_PATH = '/org/gnome/Shell/Extensions/ddterm'
TEST_DBUS_INTERFACE = 'com.github.amezin.ddterm.ExtensionTest'
TEST_SERVICE = 'org.gnome.Shell'


def call(connection, method, signature=None, *args, dest=TEST_SERVICE, path=TEST_DBUS_PATH, interface=TEST_DBUS_INTERFACE, return_type=None, timeout=None):
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


def get_property(connection, name, interface=TEST_DBUS_INTERFACE, **kwargs):
    return call(
        connection,
        'Get',
        '(ss)',
        interface,
        name,
        interface='org.freedesktop.DBus.Properties',
        return_type='(v)',
        **kwargs
    )[0]


def wait_interface(connection, dest=TEST_SERVICE, path=TEST_DBUS_PATH, interface=TEST_DBUS_INTERFACE):
    loop = GLib.MainLoop.new(None, False)
    retry_source = None

    def cancel_retry():
        nonlocal retry_source

        if retry_source is not None:
            retry_source.destroy()
            retry_source = None

    def introspect(connection, name, owner):
        LOGGER.info('Calling Introspect() on destination %r, path %r', owner, path)
        try:
            (data,) = call(connection, 'Introspect', return_type='(s)', dest=owner, path=path, interface='org.freedesktop.DBus.Introspectable')
            LOGGER.info('Introspect() call succeeded on destination %r, path %r', owner, path)

            parsed = Gio.DBusNodeInfo.new_for_xml(data)
            if parsed.lookup_interface(interface):
                loop.quit()
                return
            else:
                LOGGER.info('Interface %r not found in Introspect() results on destination %r, path %r', interface, owner, path)

        except GLib.Error:
            LOGGER.exception('Introspect() call failed on destination %r, path %r', owner, path)

        cancel_retry()

        nonlocal retry_source
        retry_source = GLib.timeout_source_new(50)
        retry_source.set_callback(lambda *_: introspect(connection, name, owner))
        retry_source.attach(loop.get_context())

    watch_id = Gio.bus_watch_name_on_connection(connection, dest, Gio.BusNameWatcherFlags.NONE, introspect, lambda *_: cancel_retry)
    try:
        loop.run()

    finally:
        Gio.bus_unwatch_name(watch_id)
        cancel_retry()


def connect_tcp(host, port):
    return Gio.DBusConnection.new_for_address_sync(
        f'tcp:host={host},port={port}',
        Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT | Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION,
        None,
        None
    )
