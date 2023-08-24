import logging

from gi.repository import GLib, GObject, Gio

from . import glib_util


LOGGER = logging.getLogger(__name__)

DEFAULT_TIMEOUT_MS = 1000


def get_interface_async(connection, name, path, interface, cancellable, set_result, set_exception):
    def proxy_result(source, result, *_):
        try:
            proxy = source.new_finish(result)

        except GLib.Error as ex:
            set_exception(ex)
            return

        proxy.set_default_timeout(DEFAULT_TIMEOUT_MS)
        set_result(proxy)

    def introspect_result(source, result, *_):
        try:
            introspection = source.call_finish(result)
            (introspection_xml,) = introspection.unpack()
            node_info = Gio.DBusNodeInfo.new_for_xml(introspection_xml)
            interface_info = node_info.lookup_interface(interface)

        except BaseException as ex:
            set_exception(ex)
            return

        if interface_info is None:
            set_result(None)
            return

        Gio.DBusProxy.new(
            connection,
            Gio.DBusProxyFlags.GET_INVALIDATED_PROPERTIES,
            interface_info,
            name,
            path,
            interface,
            cancellable,
            proxy_result
        )

    connection.call(
        name,
        path,
        'org.freedesktop.DBus.Introspectable',
        'Introspect',
        None,
        GLib.VariantType.new('(s)'),
        Gio.DBusCallFlags.NONE,
        DEFAULT_TIMEOUT_MS,
        cancellable,
        introspect_result
    )


def wait_interface_async(connection, name, path, interface, cancellable, set_result, set_exception):
    inner_cancellable = None
    cancel_handler = None
    retry_timer = glib_util.OneShotTimer()
    watch_id = None

    def cancel_inner():
        retry_timer.cancel()

        nonlocal inner_cancellable

        if not inner_cancellable:
            return False

        inner_cancellable.cancel()
        inner_cancellable = None
        return True

    def got_result(result):
        nonlocal cancel_handler
        nonlocal watch_id

        cancel_inner()

        if result is None:
            retry_timer.schedule(100, retry)
            return

        if cancel_handler is not None:
            cancellable.disconnect(cancel_handler)
            cancel_handler = None

        if watch_id is not None:
            Gio.bus_unwatch_name(watch_id)
            watch_id = None

        LOGGER.info('D-Bus: got interface %r on path %r name %r', interface, path, name)
        set_result(result)

    def retry():
        if cancel_inner():
            return

        nonlocal inner_cancellable
        inner_cancellable = Gio.Cancellable()

        get_interface_async(
            connection,
            name,
            path,
            interface,
            inner_cancellable,
            got_result,
            got_exception
        )

    def got_exception(exception):
        LOGGER.exception(
            'D-Bus: got exception while waiting for interface %r on path %r name %r',
            interface, path, name
        )

        if watch_id is not None:
            retry_timer.schedule(100, retry)
            return

        set_exception(exception)

    def name_appeared(connection, name, name_owner, *_):
        LOGGER.info('D-Bus: name %r appeared, new owner %r', name, name_owner)
        retry()

    def name_vanished(connection_, name, *_):
        LOGGER.info('D-Bus: name %r vanished', name)
        cancel_inner()

    def cancelled(*_):
        nonlocal cancel_handler
        nonlocal watch_id

        if watch_id is not None:
            Gio.bus_unwatch_name(watch_id)
            watch_id = None

        if cancel_handler is not None:
            GObject.signal_handler_disconnect(cancellable, cancel_handler)
            cancel_handler = None

        if cancel_inner():
            return

        try:
            cancellable.set_error_if_cancelled()
        except GLib.Error as ex:
            set_exception(ex)

    if cancellable is not None:
        cancel_handler = cancellable.connect(cancelled)

    LOGGER.info('D-Bus: waiting for interface %r on path %r name %r', interface, path, name)

    watch_id = Gio.bus_watch_name_on_connection(
        connection,
        name,
        Gio.BusNameWatcherFlags.AUTO_START,
        name_appeared,
        name_vanished
    )


def wait_interface(connection, name, path, interface, timeout=None):
    sync = glib_util.SyncCall()

    wait_interface_async(
        connection,
        name,
        path,
        interface,
        sync.cancellable,
        sync.set_result,
        sync.set_exception
    )

    return sync.run(timeout)


def connect_tcp(host, port, timeout=None):
    sync = glib_util.SyncCall()

    def callback(source, result, *_):
        try:
            sync.set_result(source.new_for_address_finish(result))

        except GLib.Error as ex:
            sync.set_exception(ex)

    Gio.DBusConnection.new_for_address(
        f'tcp:host={host},port={port}',
        (
            Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT |
            Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION
        ),
        None,
        sync.cancellable,
        callback
    )

    return sync.run(timeout)
