# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

import collections

from gi.repository import GLib, GObject, Gio


_VariantTypeInfo = collections.namedtuple('_VariantTypeInfo', ('gtype', 'unpack'))

_VARIANT_TYPE = {
    'b': _VariantTypeInfo(GObject.TYPE_BOOLEAN, GLib.Variant.get_boolean),
    'y': _VariantTypeInfo(GObject.TYPE_UCHAR, GLib.Variant.get_byte),
    'n': _VariantTypeInfo(GObject.TYPE_INT, GLib.Variant.get_int16),
    'q': _VariantTypeInfo(GObject.TYPE_UINT, GLib.Variant.new_uint16),
    'i': _VariantTypeInfo(GObject.TYPE_INT, GLib.Variant.get_int32),
    'u': _VariantTypeInfo(GObject.TYPE_UINT, GLib.Variant.get_uint32),
    'x': _VariantTypeInfo(GObject.TYPE_INT64, GLib.Variant.get_int64),
    't': _VariantTypeInfo(GObject.TYPE_UINT64, GLib.Variant.get_uint64),
    'h': _VariantTypeInfo(GObject.TYPE_INT, GLib.Variant.get_handle),
    'd': _VariantTypeInfo(GObject.TYPE_DOUBLE, GLib.Variant.get_double),
    's': _VariantTypeInfo(GObject.TYPE_STRING, GLib.Variant.get_string),
    'o': _VariantTypeInfo(GObject.TYPE_STRING, GLib.Variant.get_string),
    'g': _VariantTypeInfo(GObject.TYPE_STRING, GLib.Variant.get_string),
    'v': _VariantTypeInfo(GObject.TYPE_VARIANT, GLib.Variant.get_variant),
    'as': _VariantTypeInfo(GObject.TYPE_STRV, GLib.Variant.get_strv),
    'ao': _VariantTypeInfo(GObject.TYPE_STRV, GLib.Variant.get_strv),
    'ag': _VariantTypeInfo(GObject.TYPE_STRV, GLib.Variant.get_strv),
}

_VARIANT_TYPE_FALLBACK = _VariantTypeInfo(GObject.TYPE_VARIANT, lambda v: v)


def _ensure_variant(signature, value):
    if isinstance(value, GLib.Variant) and value.get_type_string() == signature:
        return value

    return GLib.Variant(signature, value)


def _make_method(method_info):
    method_name = method_info.name
    in_signatures = tuple(arg_info.signature for arg_info in method_info.in_args)
    unpackers = tuple(
        _VARIANT_TYPE.get(arg_info.signature, _VARIANT_TYPE_FALLBACK).unpack
        for arg_info in method_info.out_args
    )

    def unpack(variant):
        assert variant.n_children() == len(unpackers)

        return tuple(unpacker(variant.get_child_value(i)) for i, unpacker in enumerate(unpackers))

    def method(
        self,
        *args,
        flags=Gio.DBusCallFlags.NONE,
        timeout=None,
        cancellable=None,
    ):
        parameters = GLib.Variant.new_tuple(
            *(
                _ensure_variant(signature, v)
                for signature, v in zip(in_signatures, args, strict=True)
            )
        )

        if timeout is None:
            timeout = self.get_default_timeout()

        result = self.call_sync(method_name, parameters, flags, timeout, cancellable)
        result = unpack(result)

        if len(result) == 0:
            return None

        if len(result) == 1:
            return result[0]

        return result

    return method


def _make_property(property_info):
    name = property_info.name
    signature = property_info.signature
    gtype, unpack = _VARIANT_TYPE.get(signature, _VARIANT_TYPE_FALLBACK)
    minimum = None
    maximum = None
    default = None
    flags = GObject.ParamFlags.EXPLICIT_NOTIFY

    if signature == 'n':
        minimum = GLib.MININT16
        maximum = GLib.MAXINT16

    elif signature == 'q':
        minimum = 0
        maximum = GLib.MAXUINT16

    elif signature == 'b':
        default = False

    if property_info.flags & Gio.DBusPropertyInfoFlags.READABLE:
        def getter(self):
            cached = self.get_cached_property(name)

            if cached is None:
                return None

            return unpack(cached)

        flags |= GObject.ParamFlags.READABLE

    else:
        getter = None

    if property_info.flags & Gio.DBusPropertyInfoFlags.WRITABLE:
        def setter(self, value):
            self.set_dbus_property(name, _ensure_variant(signature, value))

        flags |= GObject.ParamFlags.WRITABLE

    else:
        setter = None

    return GObject.Property(
        getter=getter,
        setter=setter,
        type=gtype,
        flags=flags,
        nick=name,
        minimum=minimum,
        maximum=maximum,
        default=default,
    )


def _make_signal(signal_info):
    arg_types = tuple(
        _VARIANT_TYPE.get(arg_info.signature, _VARIANT_TYPE_FALLBACK).gtype
        for arg_info in signal_info.args
    )

    unpackers = tuple(
        _VARIANT_TYPE.get(arg_info.signature, _VARIANT_TYPE_FALLBACK).unpack
        for arg_info in signal_info.args
    )

    def arg_unpack(variant):
        assert variant.n_children() == len(unpackers)

        return tuple(unpacker(variant.get_child_value(i)) for i, unpacker in enumerate(unpackers))

    return GObject.Signal(name=signal_info.name, arg_types=arg_types), arg_unpack


def _chain_call(cls, attr, func):
    existing = cls.__dict__.get(attr)

    if existing is None:
        setattr(cls, attr, func)
        return

    def wrapper(*args, **kwargs):
        try:
            func(*args, **kwargs)
        finally:
            existing(*args, **kwargs)

    setattr(cls, attr, wrapper)


class Proxy(Gio.DBusProxy):
    def __init_subclass__(cls, *args, **kwargs):
        dbus_interface_info = cls.__dict__.get('__dbus_interface_info__')

        if not dbus_interface_info:
            super().__init_subclass__(*args, **kwargs)
            return

        if isinstance(dbus_interface_info, str):
            dbus_interface_info = Gio.DBusNodeInfo.new_for_xml(dbus_interface_info)

        if isinstance(dbus_interface_info, Gio.DBusNodeInfo):
            [dbus_interface_info] = dbus_interface_info.interfaces

        for method_info in dbus_interface_info.methods:
            if method_info.name not in cls.__dict__:
                setattr(cls, method_info.name.replace('-', '_'), _make_method(method_info))

        property_names = set()

        for property_info in dbus_interface_info.properties:
            if property_info.name not in cls.__dict__:
                setattr(cls, property_info.name.replace('-', '_'), _make_property(property_info))
                property_names.add(property_info.name)

        if property_names:
            def do_g_properties_changed(self, changed, invalidated):
                with self.freeze_notify():
                    for name in changed.keys():
                        if name in property_names:
                            self.notify(name)

                    if not (self.get_flags() & Gio.DBusProxyFlags.GET_INVALIDATED_PROPERTIES):
                        for name in invalidated:
                            if name in property_names:
                                self.notify(name)

            _chain_call(cls, 'do_g_properties_changed', do_g_properties_changed)

        signals = {}

        for signal_info in dbus_interface_info.signals:
            if signal_info.name not in cls.__dict__:
                descriptor, arg_unpack = _make_signal(signal_info)
                setattr(cls, signal_info.name.replace('-', '_'), descriptor)
                signals[signal_info.name] = arg_unpack

        if signals:
            def do_g_signal(self, sender, signal, parameters):
                arg_unpack = signals.get(signal)

                if arg_unpack is not None:
                    self.emit(signal, *arg_unpack(parameters))

            _chain_call(cls, 'do_g_signal', do_g_signal)

        default_flags = Gio.DBusProxyFlags.NONE

        if dbus_interface_info.properties:
            default_flags |= Gio.DBusProxyFlags.GET_INVALIDATED_PROPERTIES
        else:
            default_flags |= Gio.DBusProxyFlags.DO_NOT_LOAD_PROPERTIES

        if not dbus_interface_info.signals:
            default_flags |= Gio.DBusProxyFlags.DO_NOT_CONNECT_SIGNALS

        cls.G_FLAGS_DEFAULT = default_flags

        prev_init = cls.__init__

        def init(self, **kwargs):
            kwargs.setdefault('g_flags', default_flags)

            prev_init(
                self,
                g_interface_name=dbus_interface_info.name,
                g_interface_info=dbus_interface_info,
                **kwargs,
            )

        cls.__init__ = init

        super().__init_subclass__(*args, **kwargs)

    def pack_method_parameters(self, method_name, parameters):
        if parameters is not None and not isinstance(parameters, GLib.Variant):
            method_info = self.get_interface_info().lookup_method(method_name)

            parameters = GLib.Variant.new_tuple(
                *(
                    _ensure_variant(info.signature, v)
                    for info, v in zip(method_info.in_args, parameters, strict=True)
                )
            )

        return parameters

    def call(
        self,
        method_name,
        parameters=None,
        flags=Gio.DBusCallFlags.NONE,
        timeout=None,
        cancellable=None,
        callback=None,
    ):
        if timeout is None:
            timeout = self.get_default_timeout()

        parameters = self.pack_method_parameters(method_name, parameters)

        return super().call(method_name, parameters, flags, timeout, cancellable, callback)

    def call_sync(
        self,
        method_name,
        parameters=None,
        flags=Gio.DBusCallFlags.NONE,
        timeout=None,
        cancellable=None,
    ):
        if timeout is None:
            timeout = self.get_default_timeout()

        parameters = self.pack_method_parameters(method_name, parameters)

        return super().call_sync(method_name, parameters, flags, timeout, cancellable)

    def set_dbus_property(
        self,
        name,
        value,
        flags=Gio.DBusCallFlags.NONE,
        timeout=None,
        cancellable=None,
        callback=None,
    ):
        if timeout is None:
            timeout = self.get_default_timeout()

        if interface_info := self.get_interface_info():
            property_info = interface_info.lookup_property(name)
            value = _ensure_variant(property_info.signature, value)

        if callback is not None:
            task = Gio.Task.new(self, cancellable, callback)

            def inner_callback(source, result, *_):
                try:
                    source.call_finish(result)
                    task.return_value(None)
                except GLib.Error as ex:
                    task.return_error(ex)

            callback = inner_callback

        self.get_connection().call(
            self.get_name_owner(),
            self.get_object_path(),
            'org.freedesktop.DBus.Properties',
            'Set',
            GLib.Variant.new_tuple(
                GLib.Variant.new_string(self.get_interface_name()),
                GLib.Variant.new_string(name),
                GLib.Variant.new_variant(value),
            ),
            None,
            flags,
            timeout,
            cancellable,
            callback,
        )

    def set_dbus_property_finish(self, result):
        ok, value = result.propagate_value()
        assert ok
        return value

    def __getattr__(self, name):
        raise AttributeError(name)

    def __repr__(self):
        return f'{self.__class__.__qualname__}(' \
            f'g_name={self.get_name()!r}, ' \
            f'g_object_path={self.get_object_path()!r}, ' \
            f'g_interface_name={self.get_interface_name()!r}' \
            ')'
