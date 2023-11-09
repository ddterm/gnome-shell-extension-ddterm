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
        'resize-x': GObject.ParamSpec.boolean(
            'resize-x',
            '',
            '',
            GObject.ParamFlags.READABLE,
            false
        ),
        'right-or-bottom': GObject.ParamSpec.boolean(
            'right-or-bottom',
            '',
            '',
            GObject.ParamFlags.READABLE,
            false
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

        this._workarea = null;
        this._target_rect = null;
        this._monitor_index = 0;
        this._resize_x = false;
        this._right_or_bottom = false;
        this._workareas_changed_handler =
            global.display.connect('workareas-changed', this._update_workarea.bind(this));

        this.connect('notify::window-size', this._update_target_rect.bind(this));
        this.connect('notify::window-position', this._update_window_position.bind(this));
        this.connect('notify::window-monitor', this.update_monitor.bind(this));
        this.connect('notify::window-monitor-connector', this.update_monitor.bind(this));

        this.update_monitor();
        this._update_window_position();
    }

    disable() {
        if (this._workareas_changed_handler) {
            global.display.disconnect(this._workareas_changed_handler);
            this._workareas_changed_handler = null;
        }
    }

    static get_target_rect(workarea, monitor_scale, size, resize_x, right_or_bottom) {
        const target_rect = workarea.copy();

        if (resize_x) {
            target_rect.width *= size;
            target_rect.width -= target_rect.width % monitor_scale;

            if (right_or_bottom)
                target_rect.x += workarea.width - target_rect.width;
        } else {
            target_rect.height *= size;
            target_rect.height -= target_rect.height % monitor_scale;

            if (right_or_bottom)
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

    get resize_x() {
        return this._resize_x;
    }

    get right_or_bottom() {
        return this._right_or_bottom;
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

    _set_resize_x(new_resize_x) {
        if (this._resize_x === new_resize_x)
            return;

        this._resize_x = new_resize_x;
        this.notify('resize-x');
    }

    _set_right_or_bottom(new_right_or_bottom) {
        if (this._right_or_bottom === new_right_or_bottom)
            return;

        this._right_or_bottom = new_right_or_bottom;
        this.notify('right-or-bottom');
    }

    _update_workarea() {
        const n_monitors = global.display.get_n_monitors();

        if (n_monitors === 0)
            return;

        if (this._monitor_index >= n_monitors) {
            this.update_monitor();
            return;
        }

        this._set_workarea(Main.layoutManager.getWorkAreaForMonitor(this._monitor_index));
        this._update_target_rect();
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
        this._set_monitor_index(this._get_monitor_index());

        this._update_workarea();
    }

    _update_window_position() {
        this._set_resize_x(
            [Meta.Side.LEFT, Meta.Side.RIGHT].includes(this.window_position)
        );

        this._set_right_or_bottom(
            [Meta.Side.RIGHT, Meta.Side.BOTTOM].includes(this.window_position)
        );

        this._update_target_rect();
    }

    _update_target_rect() {
        if (!this._workarea)
            return;

        const target_rect = WindowGeometry.get_target_rect(
            this._workarea,
            Math.floor(global.display.get_monitor_scale(this._monitor_index)),
            this.window_size,
            this._resize_x,
            this._right_or_bottom
        );

        this._set_target_rect(target_rect);
    }
});
