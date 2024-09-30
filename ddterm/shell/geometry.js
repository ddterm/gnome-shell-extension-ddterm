/*
    Copyright © 2023 Aleksandr Mezin

    This file is part of ddterm GNOME Shell extension.

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import Graphene from 'gi://Graphene';
import Meta from 'gi://Meta';
import Mtk from 'gi://Mtk';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { get_current_state, LayoutMode } from '../util/displayconfig.js';

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
        'logical-target-rect': GObject.ParamSpec.boxed(
            'logical-target-rect',
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
}, class DDTermWindowGeometry extends GObject.Object {
    _init(params) {
        super._init(params);

        this._monitor_manager = get_monitor_manager();

        this._monitors_changed_handler =
            this._monitor_manager.connect('monitors-changed', this._update_layout_mode.bind(this));

        this._workareas_changed_handler =
            global.display.connect('workareas-changed', this._update_workarea.bind(this));

        this.connect('notify::window-size', this._update_target_rect.bind(this));
        this.connect('notify::window-position', this._update_window_position.bind(this));
        this.connect('notify::window-monitor', this.update_monitor.bind(this));
        this.connect('notify::window-monitor-connector', this.update_monitor.bind(this));

        this._update_window_position();
        this._update_layout_mode();
        this.update_monitor();
    }

    disable() {
        if (this._workareas_changed_handler) {
            global.display.disconnect(this._workareas_changed_handler);
            this._workareas_changed_handler = null;
        }

        if (this._monitors_changed_handler) {
            this._monitor_manager.disconnect(this._monitors_changed_handler);
            this._monitors_changed_handler = null;
        }

        this._cancellable?.cancel();
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

    get logical_target_rect() {
        return this._logical_target_rect ?? null;
    }

    get workarea() {
        return this._workarea;
    }

    get monitor_index() {
        return this._monitor_index;
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

    _set_logical_target_rect(new_target_rect) {
        if (this._logical_target_rect?.equal(new_target_rect))
            return;

        this._logical_target_rect = new_target_rect;
        this.notify('logical-target-rect');
    }

    _set_monitor_index(new_monitor_index) {
        if (this._monitor_index === new_monitor_index)
            return;

        this._monitor_index = new_monitor_index;
        this.notify('monitor-index');
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

            this._set_workarea(Main.layoutManager.getWorkAreaForMonitor(this._monitor_index));
            this._update_target_rect();
        } finally {
            this.thaw_notify();
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
            const index = this._monitor_manager.get_monitor_for_connector(
                this.window_monitor_connector
            );

            if (index >= 0)
                return index;
        }

        return global.display.get_current_monitor();
    }

    update_monitor() {
        this.freeze_notify();

        try {
            this._set_monitor_index(this._get_monitor_index());
            this._update_workarea();
        } finally {
            this.thaw_notify();
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
            this.thaw_notify();
        }
    }

    _update_target_rect() {
        if (!this._workarea)
            return;

        const target_rect = WindowGeometry.get_target_rect(
            this._workarea,
            Math.floor(global.display.get_monitor_scale(this._monitor_index)),
            this.window_size,
            this.window_position
        );

        this.freeze_notify();

        try {
            this._set_target_rect(target_rect);
            this._update_logical_target_rect();
        } finally {
            this.thaw_notify();
        }
    }

    _update_logical_target_rect() {
        if (this._layout_mode !== LayoutMode.PHYSICAL) {
            if (this._layout_mode === LayoutMode.LOGICAL)
                this._set_logical_target_rect(this._target_rect);

            return;
        }

        const scale = global.display.get_monitor_scale(this._monitor_index);
        const rect = this._target_rect.copy();

        rect.width /= scale;
        rect.height /= scale;

        this._set_logical_target_rect(rect);
    }

    _update_layout_mode() {
        this._cancellable?.cancel();
        this._cancellable = new Gio.Cancellable();
        this._layout_mode = null;

        get_current_state(Gio.DBus.session, this._cancellable).then(current_state => {
            const properties = current_state.get_child_value(3);
            const layout_mode = properties.lookup_value('layout-mode', null)?.unpack();

            if (layout_mode !== this._layout_mode) {
                this._layout_mode = layout_mode;
                this._update_logical_target_rect();
            }
        }).catch(error => {
            if (!(error instanceof GLib.Error &&
                  error.matches(Gio.io_error_quark(), Gio.IOErrorEnum.CANCELLED)))
                logError(error);
        });
    }
});
