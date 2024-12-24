// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import Graphene from 'gi://Graphene';
import Meta from 'gi://Meta';
import Mtk from 'gi://Mtk';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

function get_monitor_manager() {
    if (Meta.MonitorManager.get)
        return Meta.MonitorManager.get();

    return global.backend.get_monitor_manager();
}

export const WindowGeometry = GObject.registerClass({
    Properties: {
        'target-rect': GObject.ParamSpec.boxed(
            'target-rect',
            '',
            '',
            GObject.ParamFlags.READABLE,
            Mtk.Rectangle
        ),
        'workarea': GObject.ParamSpec.boxed(
            'workarea',
            '',
            '',
            GObject.ParamFlags.READABLE,
            Mtk.Rectangle
        ),
        'monitor-index': GObject.ParamSpec.int(
            'monitor-index',
            '',
            '',
            GObject.ParamFlags.READABLE,
            0,
            GLib.MAXINT32,
            0
        ),
        'monitor-scale': GObject.ParamSpec.double(
            'monitor-scale',
            '',
            '',
            GObject.ParamFlags.READABLE,
            0,
            100,
            1
        ),
        'pivot-point': GObject.ParamSpec.boxed(
            'pivot-point',
            '',
            '',
            GObject.ParamFlags.READABLE,
            Graphene.Point
        ),
        'orientation': GObject.ParamSpec.enum(
            'orientation',
            '',
            '',
            GObject.ParamFlags.READABLE,
            Clutter.Orientation,
            Clutter.Orientation.VERTICAL
        ),
        'maximize-flag': GObject.ParamSpec.flags(
            'maximize-flag',
            '',
            '',
            GObject.ParamFlags.READABLE,
            Meta.MaximizeFlags,
            Meta.MaximizeFlags.VERTICAL
        ),
        'window-size': GObject.ParamSpec.double(
            'window-size',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            0,
            1,
            0.6
        ),
        'window-position': GObject.ParamSpec.enum(
            'window-position',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            Meta.Side,
            Meta.Side.TOP
        ),
        'window-monitor': GObject.ParamSpec.string(
            'window-monitor',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            'current'
        ),
        'window-monitor-connector': GObject.ParamSpec.string(
            'window-monitor-connector',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            ''
        ),
    },
    Signals: {
        'updated': {},
    },
}, class DDTermWindowGeometry extends GObject.Object {
    _init(params) {
        super._init(params);

        this._workareas_changed_handler = global.display.connect(
            'workareas-changed',
            this._update_workarea.bind(this)
        );

        this.connect('notify::window-size', this._update_target_rect.bind(this));
        this.connect('notify::window-position', this._update_window_position.bind(this));
        this.connect('notify::window-monitor', this.update_monitor.bind(this));
        this.connect('notify::window-monitor-connector', this.update_monitor.bind(this));

        this._update_window_position();
        this.update_monitor();
    }

    disable() {
        if (this._workareas_changed_handler) {
            global.display.disconnect(this._workareas_changed_handler);
            this._workareas_changed_handler = null;
        }
    }

    static get_target_rect(workarea, monitor_scale, size, window_pos) {
        const target_rect = workarea.copy();

        if (window_pos === Meta.Side.LEFT || window_pos === Meta.Side.RIGHT) {
            target_rect.width *= size;
            target_rect.width -= target_rect.width % monitor_scale;

            if (window_pos === Meta.Side.RIGHT)
                target_rect.x += workarea.width - target_rect.width;
        } else {
            target_rect.height *= size;
            target_rect.height -= target_rect.height % monitor_scale;

            if (window_pos === Meta.Side.BOTTOM)
                target_rect.y += workarea.height - target_rect.height;
        }

        return target_rect;
    }

    bind_settings(settings) {
        [
            'window-size',
            'window-position',
            'window-monitor',
            'window-monitor-connector',
        ].forEach(key => {
            settings.bind(key, this, key, Gio.SettingsBindFlags.GET);
        });
    }

    get target_rect() {
        return this._target_rect;
    }

    get workarea() {
        return this._workarea;
    }

    get monitor_index() {
        return this._monitor_index;
    }

    get monitor_scale() {
        return this._monitor_scale;
    }

    get pivot_point() {
        return this._pivot_point;
    }

    get orientation() {
        return this._orientation;
    }

    get maximize_flag() {
        return this._maximize_flag;
    }

    _set_workarea(new_workarea) {
        if (this._workarea?.equal(new_workarea))
            return;

        this._workarea = new_workarea;
        this.notify('workarea');
    }

    _set_target_rect(new_target_rect) {
        if (this._target_rect?.equal(new_target_rect))
            return;

        this._target_rect = new_target_rect;
        this.notify('target-rect');
    }

    _set_monitor_index(new_monitor_index) {
        if (this._monitor_index === new_monitor_index)
            return;

        this._monitor_index = new_monitor_index;
        this.notify('monitor-index');
    }

    _set_monitor_scale(new_monitor_scale) {
        if (this._monitor_scale === new_monitor_scale)
            return;

        this._monitor_scale = new_monitor_scale;
        this.notify('monitor-scale');
    }

    _set_pivot_point(x, y) {
        if (this._pivot_point?.x === x && this._pivot_point?.y === y)
            return;

        this._pivot_point = new Graphene.Point({ x, y });
        this.notify('pivot-point');
    }

    _set_orientation(new_orientation) {
        if (this._orientation === new_orientation)
            return;

        this._orientation = new_orientation;
        this.notify('orientation');
    }

    _set_maximize_flag(new_maximize_flag) {
        if (this._maximize_flag === new_maximize_flag)
            return;

        this._maximize_flag = new_maximize_flag;
        this.notify('maximize-flag');
    }

    _update_workarea() {
        this.freeze_notify();

        try {
            const n_monitors = global.display.get_n_monitors();

            if (n_monitors === 0)
                return;

            if (this._monitor_index >= n_monitors) {
                this.update_monitor();
                return;
            }

            this._set_monitor_scale(global.display.get_monitor_scale(this._monitor_index));
            this._set_workarea(Main.layoutManager.getWorkAreaForMonitor(this._monitor_index));
            this._update_target_rect();
        } finally {
            this._thaw_notify_emit_updated();
        }
    }

    _get_monitor_index() {
        if (this.window_monitor === 'primary') {
            if (Main.layoutManager.primaryIndex >= 0)
                return Main.layoutManager.primaryIndex;
        }

        if (this.window_monitor === 'focus') {
            if (Main.layoutManager.focusIndex >= 0)
                return Main.layoutManager.focusIndex;
        }

        if (this.window_monitor === 'connector') {
            const monitor_manager = get_monitor_manager();

            if (monitor_manager) {
                const index = monitor_manager.get_monitor_for_connector(
                    this.window_monitor_connector
                );

                if (index >= 0)
                    return index;
            }
        }

        return global.display.get_current_monitor();
    }

    update_monitor() {
        this.freeze_notify();

        try {
            this._set_monitor_index(this._get_monitor_index());
            this._update_workarea();
        } finally {
            this._thaw_notify_emit_updated();
        }
    }

    _update_window_position() {
        this.freeze_notify();

        try {
            switch (this.window_position) {
            case Meta.Side.LEFT:
            case Meta.Side.RIGHT:
                this._set_orientation(Clutter.Orientation.HORIZONTAL);
                this._set_maximize_flag(Meta.MaximizeFlags.HORIZONTAL);
                break;

            case Meta.Side.TOP:
            case Meta.Side.BOTTOM:
                this._set_orientation(Clutter.Orientation.VERTICAL);
                this._set_maximize_flag(Meta.MaximizeFlags.VERTICAL);
            }

            if (this._orientation === Clutter.Orientation.HORIZONTAL)
                this._set_pivot_point(this.window_position === Meta.Side.RIGHT ? 1.0 : 0.0, 0.5);
            else
                this._set_pivot_point(0.5, this.window_position === Meta.Side.BOTTOM ? 1.0 : 0.0);

            this._update_target_rect();
        } finally {
            this._thaw_notify_emit_updated();
        }
    }

    _update_target_rect() {
        this.freeze_notify();

        try {
            if (!this._workarea)
                return;

            const target_rect = WindowGeometry.get_target_rect(
                this._workarea,
                Math.floor(this._monitor_scale),
                this.window_size,
                this.window_position
            );

            this._set_target_rect(target_rect);
        } finally {
            this._thaw_notify_emit_updated();
        }
    }

    _thaw_notify_emit_updated() {
        // 'updated' should ideally be emitted by vfunc_dispatch_properties_changed()
        // But implementing dispatch_properties_changed() in GJS doesn't seem possible.

        this._notify_emitted = false;
        this.thaw_notify();

        if (this._notify_emitted)
            this.emit('updated');
    }

    on_notify() {
        this._notify_emitted = true;
    }
});
