# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

import collections.abc
import dataclasses
import enum
import logging
import pathlib
import typing

from gi.repository import GLib, Gio

from . import dbusutil, glibutil


BUS_NAME = 'org.gnome.Mutter.DisplayConfig'
OBJECT_PATH = '/org/gnome/Mutter/DisplayConfig'
INTERFACE_NAME = 'org.gnome.Mutter.DisplayConfig'

THIS_FILE = pathlib.Path(__file__).resolve()
THIS_DIR = THIS_FILE.parent
INTROSPECT_FILE = THIS_DIR / 'dbus-interfaces' / f'{INTERFACE_NAME}.xml'

[INTERFACE_INFO] = Gio.DBusNodeInfo.new_for_xml(INTROSPECT_FILE.read_text()).interfaces

LOGGER = logging.getLogger(__name__)


@enum.unique
class Transform(enum.IntEnum):
    NORMAL = 0
    ROTATE_90 = 1
    ROTATE_180 = 2
    ROTATE_270 = 3
    FLIPPED = 4
    ROTATE_90_FLIPPED = 5
    ROTATE_180_FLIPPED = 6
    ROTATE_270_FLIPPED = 7


@enum.unique
class LayoutMode(enum.IntEnum):
    LOGICAL = 1
    PHYSICAL = 2


def variant_iter_children(variant: GLib.Variant):
    for i in range(variant.n_children()):
        yield variant.get_child_value(i)


def match_attrs(obj, attrs):
    return all(
        getattr(obj, attr) == expected_value
        for attr, expected_value in attrs.items()
    )


def find_by_attrs(iterable, attrs):
    for item in iterable:
        if match_attrs(item, attrs):
            return item

    raise KeyError(attrs)


class Properties(dict[str, GLib.Variant]):
    VARIANT_TYPE = GLib.VariantType.new('a{sv}')

    def pack(self):
        builder = GLib.VariantDict.new(None)

        for k, v in self.items():
            builder.insert_value(k, v)

        return builder.end()

    @classmethod
    def parse_variant(cls, variant: GLib.Variant):
        def parse_kv(kv):
            k, v = variant_iter_children(kv)
            assert k.classify() == GLib.VariantClass.STRING
            assert v.classify() == GLib.VariantClass.VARIANT
            return k.unpack(), v.unpack()

        return cls(
            parse_kv(kv)
            for kv in variant_iter_children(variant)
        )


@dataclasses.dataclass(frozen=True)
class MonitorSpec:
    VARIANT_TYPE: typing.ClassVar[GLib.VariantType] = GLib.VariantType.new('(ssss)')

    connector: str
    vendor: str
    product: str
    serial: str

    @classmethod
    def parse_variant(cls, variant: GLib.Variant):
        connector, vendor, product, serial = variant_iter_children(variant)

        return cls(
            connector=connector.get_string(),
            vendor=vendor.get_string(),
            product=product.get_string(),
            serial=serial.get_string(),
        )


@dataclasses.dataclass(frozen=True)
class CurrentState:
    @dataclasses.dataclass(frozen=True)
    class Monitor:
        @dataclasses.dataclass(frozen=True)
        class Mode:
            VARIANT_TYPE: typing.ClassVar[GLib.VariantType] = GLib.VariantType.new('(siiddada{sv})')

            mode_id: str
            width: int
            height: int
            refresh_rate: float
            preferred_scale: float
            supported_scales: collections.abc.Sequence[float]
            properties: collections.abc.Mapping[str, GLib.Variant]

            @property
            def is_current(self):
                return self.properties.get('is-current', False)

            @classmethod
            def parse_variant(cls, variant: GLib.Variant):
                (
                    mode_id,
                    width,
                    height,
                    refresh_rate,
                    preferred_scale,
                    supported_scales,
                    properties,
                ) = variant_iter_children(variant)

                return cls(
                    mode_id=mode_id.get_string(),
                    width=width.get_int32(),
                    height=height.get_int32(),
                    refresh_rate=refresh_rate.get_double(),
                    preferred_scale=preferred_scale.get_double(),
                    supported_scales=[
                        s.get_double()
                        for s in variant_iter_children(supported_scales)
                    ],
                    properties=Properties.parse_variant(properties),
                )

        VARIANT_TYPE: typing.ClassVar[GLib.VariantType] = GLib.VariantType.new_tuple([
            MonitorSpec.VARIANT_TYPE,
            GLib.VariantType.new_array(Mode.VARIANT_TYPE),
            Properties.VARIANT_TYPE,
        ])

        monitor_spec: MonitorSpec
        modes: collections.abc.Sequence[Mode]
        properties: collections.abc.Mapping[str, GLib.Variant]

        @property
        def connector(self):
            return self.monitor_spec.connector

        @classmethod
        def parse_variant(cls, variant: GLib.Variant):
            monitor, modes, properties = variant_iter_children(variant)

            return cls(
                monitor_spec=MonitorSpec.parse_variant(monitor),
                modes=[cls.Mode.parse_variant(v) for v in variant_iter_children(modes)],
                properties=Properties.parse_variant(properties),
            )

        def find_mode(self, **attrs):
            return find_by_attrs(self.modes, attrs)

    @dataclasses.dataclass(frozen=True)
    class LogicalMonitor:
        VARIANT_TYPE: typing.ClassVar[GLib.VariantType] = \
            GLib.VariantType.new('(iiduba(ssss)a{sv})')

        x: int
        y: int
        scale: float
        transform: Transform
        primary: bool
        monitors: collections.abc.Sequence[MonitorSpec]
        properties: collections.abc.Mapping[str, GLib.Variant]

        @property
        def connector(self):
            return self.monitors[0].connector

        @classmethod
        def parse_variant(cls, variant: GLib.Variant):
            (
                x,
                y,
                scale,
                transform,
                primary,
                monitors,
                properties,
            ) = variant_iter_children(variant)

            return cls(
                x=x.get_int32(),
                y=y.get_int32(),
                scale=scale.get_double(),
                transform=Transform(transform.get_uint32()),
                primary=primary.get_boolean(),
                monitors=[
                    MonitorSpec.parse_variant(v)
                    for v in variant_iter_children(monitors)
                ],
                properties=Properties.parse_variant(properties),
            )

    VARIANT_TYPE: typing.ClassVar[GLib.VariantType] = GLib.VariantType.new_tuple([
        GLib.VariantType.new('u'),
        GLib.VariantType.new_array(Monitor.VARIANT_TYPE),
        GLib.VariantType.new_array(LogicalMonitor.VARIANT_TYPE),
        Properties.VARIANT_TYPE,
    ])

    serial: int
    monitors: collections.abc.Sequence[Monitor]
    logical_monitors: collections.abc.Sequence[LogicalMonitor]
    properties: collections.abc.Mapping[str, GLib.Variant]

    @classmethod
    def parse_variant(cls, variant: GLib.Variant):
        serial, monitors, logical_monitors, properties = variant_iter_children(variant)

        return cls(
            serial=serial.get_uint32(),
            monitors=[cls.Monitor.parse_variant(v) for v in variant_iter_children(monitors)],
            logical_monitors=[
                cls.LogicalMonitor.parse_variant(v)
                for v in variant_iter_children(logical_monitors)
            ],
            properties=Properties.parse_variant(properties),
        )

    def find_monitor(self, **attrs):
        return find_by_attrs(self.monitors, attrs)

    @property
    def layout_mode(self):
        return self.properties.get('layout-mode', None)

    @property
    def supports_changing_layout_mode(self):
        return self.properties.get('supports-changing-layout-mode', False)


@dataclasses.dataclass(frozen=True)
class MonitorsConfig:
    @enum.unique
    class Method(enum.IntEnum):
        VERIFY = 0
        TEMPORARY = 1
        PERSISTENT = 2

    @dataclasses.dataclass(frozen=True)
    class LogicalMonitor:
        @dataclasses.dataclass(frozen=True)
        class Monitor:
            connector: str
            mode_id: str
            properties: collections.abc.Mapping[str, GLib.Variant]

            def pack(self):
                return GLib.Variant.new_tuple(
                    GLib.Variant.new_string(self.connector),
                    GLib.Variant.new_string(self.mode_id),
                    Properties(self.properties).pack()
                )

        x: int
        y: int
        scale: float
        transform: Transform
        primary: bool
        monitors: collections.abc.Iterable[Monitor]

        def pack(self):
            return GLib.Variant.new_tuple(
                GLib.Variant.new_int32(self.x),
                GLib.Variant.new_int32(self.y),
                GLib.Variant.new_double(self.scale),
                GLib.Variant.new_uint32(self.transform),
                GLib.Variant.new_boolean(self.primary),
                GLib.Variant.new_array(None, [m.pack() for m in self.monitors]),
            )

        def has_changes(self, index, current_state):
            current_logical = current_state.logical_monitors[index]

            for attr in ('x', 'y', 'scale', 'transform', 'primary'):
                new_value = getattr(self, attr)
                current_value = getattr(current_logical, attr)

                if current_value != new_value:
                    LOGGER.debug(
                        'Logical monitor %d: %r will be changed from %r to %r',
                        index,
                        attr,
                        current_value,
                        new_value,
                    )

                    return True

            current_connectors = tuple(m.connector for m in current_logical.monitors)
            new_connectors = tuple(m.connector for m in self.monitors)

            if current_connectors != new_connectors:
                LOGGER.debug(
                    'Logical monitor %d: connectors will be changed from %r to %r',
                    index,
                    current_connectors,
                    new_connectors
                )

                return True

            for i, new_monitor in enumerate(self.monitors):
                current_monitor = current_state.find_monitor(connector=new_monitor.connector)
                current_mode = current_monitor.find_mode(is_current=True)

                if current_mode.mode_id != new_monitor.mode_id:
                    LOGGER.debug(
                        'Logical monitor %d: connector %r mode will be changed from %r to %r',
                        index,
                        new_monitor.connector,
                        current_mode.mode_id,
                        new_monitor.mode_id,
                    )

                    return True

                if new_monitor.properties:
                    LOGGER.debug(
                        'Logical monitor %d: connector %r properties will be changed: %r',
                        index,
                        new_monitor.connector,
                        new_monitor.properties,
                    )

                    return True

            LOGGER.debug('Logical monitor %d: no pending changes', index)

            return False

    serial: int
    method: Method
    logical_monitors: collections.abc.Iterable[LogicalMonitor]
    properties: collections.abc.Mapping[str, GLib.Variant]

    def pack(self):
        return GLib.Variant.new_tuple(
            GLib.Variant.new_uint32(self.serial),
            GLib.Variant.new_uint32(self.method),
            GLib.Variant.new_array(None, [m.pack() for m in self.logical_monitors]),
            Properties(self.properties).pack(),
        )


@dataclasses.dataclass(kw_only=True, frozen=True)
class SimpleMonitorConfig:
    x: int = 0
    y: int = 0
    # 800x480 is the minimal size accepted by Mutter (with scale=1)
    width: int = 800 * 2
    height: int = 480 * 2
    scale: float = 1.0
    transform: Transform = Transform.NORMAL


class DisplayConfig(Gio.DBusProxy):
    @classmethod
    def create(cls, connection, timeout=dbusutil.DEFAULT_LONG_TIMEOUT_MS):
        obj = cls(g_connection=connection)
        glibutil.wait_init(obj, timeout)

        return obj

    def __init__(self, *args, **kwargs):
        kwargs.setdefault('g_default_timeout', dbusutil.DEFAULT_TIMEOUT_MS)

        super().__init__(
            *args,
            g_name=BUS_NAME,
            g_object_path=OBJECT_PATH,
            g_interface_name=INTERFACE_NAME,
            g_interface_info=INTERFACE_INFO,
            g_flags=(
                Gio.DBusProxyFlags.DO_NOT_AUTO_START |
                Gio.DBusProxyFlags.DO_NOT_LOAD_PROPERTIES
            ),
            **kwargs,
        )

        self.cached_state = None
        self.cached_state_valid = False

    def do_g_signal(self, sender, signal, parameters):
        if signal == 'MonitorsChanged':
            self.cached_state_valid = False

    def get_current_state(self, timeout=None):
        if self.cached_state_valid:
            return self.cached_state

        if timeout is None:
            timeout = self.get_default_timeout()

        variant = self.call_sync(
            'GetCurrentState',
            None,
            Gio.DBusCallFlags.NO_AUTO_START,
            timeout,
            None,
        )

        self.cached_state = CurrentState.parse_variant(variant)
        self.cached_state_valid = True

        return self.cached_state

    def apply_monitors_config(self, config, timeout=None):
        if timeout is None:
            timeout = self.get_default_timeout()

        self.call_sync(
            'ApplyMonitorsConfig',
            config.pack(),
            Gio.DBusCallFlags.NO_AUTO_START,
            timeout,
            None,
        )

        # Allow 'MonitorsChanged' handler to run
        glibutil.dispatch_pending_sources()

    def configure(
        self,
        monitors,
        layout_mode=None,
        primary_index=0,
        timeout=None,
    ):
        if timeout is None:
            timeout = self.get_default_timeout()

        deadline = glibutil.Deadline(timeout)
        current_state = self.get_current_state(timeout=timeout)
        current_layout_mode = current_state.layout_mode

        if layout_mode is None:
            layout_mode = current_layout_mode

        logical_monitors = [
            MonitorsConfig.LogicalMonitor(
                x=monitor.x,
                y=monitor.y,
                scale=monitor.scale,
                transform=monitor.transform,
                primary=(i == primary_index),
                monitors=[MonitorsConfig.LogicalMonitor.Monitor(
                    connector=current_state.monitors[i].connector,
                    mode_id=current_state.monitors[i].find_mode(
                        width=monitor.width,
                        height=monitor.height,
                    ).mode_id,
                    properties={},
                )],
            ) for i, monitor in enumerate(monitors)
        ]

        if 0 == sum(
            new_logical.has_changes(i, current_state)
            for i, new_logical in enumerate(logical_monitors)
        ):
            if current_layout_mode == layout_mode:
                LOGGER.debug('Skipping display config: no changes necessary')
                return False

        properties = {}

        if current_layout_mode != layout_mode:
            LOGGER.debug('Changing layout-mode from %r to %r', current_layout_mode, layout_mode)
            properties['layout-mode'] = GLib.Variant.new_uint32(layout_mode)

        elif current_state.supports_changing_layout_mode:
            # It will reset to default if not included
            # (and the default value depends on 'scale-monitor-framebuffer')
            properties['layout-mode'] = GLib.Variant.new_uint32(layout_mode)

        self.apply_monitors_config(
            MonitorsConfig(
                serial=current_state.serial,
                method=MonitorsConfig.Method.TEMPORARY,
                logical_monitors=logical_monitors,
                properties=properties,
            ),
            timeout=deadline.remaining_ms
        )

        return True
