import logging

from gi.repository import GLib, Gio

from . import glib_util


LOGGER = logging.getLogger(__name__)

DEFAULT_TIMEOUT_MS = 1000

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

    loop = GLib.MainLoop.new(GLib.MainContext.get_thread_default(), False)
    retry = glib_util.OneShotTimer()
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

            retry.schedule(100, introspect)
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
            retry.schedule(100, introspect)

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
            DEFAULT_TIMEOUT_MS,
            cancellable,
            introspect_result
        )

    with retry, glib_util.SignalConnection(introspectable, 'notify::g-name-owner', introspect):
        introspect()

        if not interface_info:
            loop.run()

        proxy = Gio.DBusProxy.new_sync(
            connection,
            Gio.DBusProxyFlags.GET_INVALIDATED_PROPERTIES,
            interface_info,
            introspectable.get_name_owner(),
            path,
            interface,
            None
        )

        proxy.set_default_timeout(DEFAULT_TIMEOUT_MS)
        return proxy


def connect_tcp(host, port, timeout=None):
    loop = GLib.MainLoop.new(GLib.MainContext.get_thread_default(), False)
    cancellable = Gio.Cancellable()
    res = None

    def callback(source, result, *_):
        nonlocal res

        try:
            res = source.new_for_address_finish(result)

        except BaseException as ex:
            res = ex

        loop.quit()

    Gio.DBusConnection.new_for_address(
        f'tcp:host={host},port={port}',
        (
            Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT |
            Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION
        ),
        None,
        cancellable,
        callback
    )

    try:
        with glib_util.OneShotTimer() as timer:
            if timeout is not None:
                timer.schedule(timeout, cancellable.cancel)

            loop.run()

    finally:
        if cancellable.is_cancelled():
            raise TimeoutError()

        if res is None:
            cancellable.cancel()
            loop.run()

    if isinstance(res, BaseException):
        raise res

    return res
