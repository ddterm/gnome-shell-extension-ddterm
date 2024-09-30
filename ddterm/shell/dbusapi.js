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
import Mtk from 'gi://Mtk';
import Shell from 'gi://Shell';

import { AppControl } from './appcontrol.js';

function report_dbus_error_async(e, invocation) {
    if (e instanceof GLib.Error) {
        invocation.return_gerror(e);
        return;
    }

    let name = e.name;
    if (!name.includes('.'))
        name = `org.gnome.gjs.JSError.${name}`;

    logError(e, `Exception in method call: ${invocation.get_method_name()}`);
    invocation.return_dbus_error(name, e.message);
}

function handle_dbus_method_call_async(func, params, invocation) {
    try {
        Promise.resolve(func(...params)).then(result => {
            invocation.return_value(result === undefined ? null : result);
        }).catch(e => report_dbus_error_async(e, invocation));
    } catch (e) {
        report_dbus_error_async(e, invocation);
    }
}

function meta_rect_to_list(meta_rect) {
    return [
        meta_rect.x,
        meta_rect.y,
        meta_rect.width,
        meta_rect.height,
    ];
}

function meta_rect_to_variant(meta_rect) {
    return GLib.Variant.new_tuple([
        GLib.Variant.new_int32(meta_rect.x),
        GLib.Variant.new_int32(meta_rect.y),
        GLib.Variant.new_int32(meta_rect.width),
        GLib.Variant.new_int32(meta_rect.height),
    ]);
}

export const DBusApi = GObject.registerClass({
    Properties: {
        'xml-file-path': GObject.ParamSpec.string(
            'xml-file-path',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            null
        ),
        'version': GObject.ParamSpec.string(
            'version',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            ''
        ),
        'revision': GObject.ParamSpec.string(
            'revision',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            ''
        ),
        'app-control': GObject.ParamSpec.object(
            'app-control',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            AppControl
        ),
        'target-rect': GObject.ParamSpec.boxed(
            'target-rect',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            Mtk.Rectangle
        ),
    },
    Signals: {
        'missing-dependencies': {
            param_types: [GObject.type_from_name('GStrv'), GObject.type_from_name('GStrv')],
        },
        'error': {
            param_types: [String, String],
        },
        'version-mismatch': {},
        'refresh-target-rect': {},
    },
}, class DDTermDBusApi extends GObject.Object {
    _init(params) {
        super._init(params);

        this._target_rect = null;

        this.dbus = Gio.DBusExportedObject.wrapJSObject(
            Shell.get_file_contents_utf8_sync(this.xml_file_path),
            this
        );
    }

    ToggleAsync(params, invocation) {
        handle_dbus_method_call_async(() => this.app_control.toggle(), params, invocation);
    }

    ActivateAsync(params, invocation) {
        handle_dbus_method_call_async(() => this.app_control.activate(), params, invocation);
    }

    HideAsync(params, invocation) {
        handle_dbus_method_call_async(() => this.app_control.hide(), params, invocation);
    }

    ServiceAsync(params, invocation) {
        handle_dbus_method_call_async(() => this.app_control.ensure_running(), params, invocation);
    }

    MissingDependencies(packages, files) {
        this.emit('missing-dependencies', packages, files);
    }

    Error(message, details) {
        this.emit('error', message, details);
    }

    VersionMismatch() {
        this.emit('version-mismatch');
    }

    GetTargetRectAsync(params, invocation) {
        this.emit('refresh-target-rect');

        if (this._target_rect) {
            invocation.return_value(meta_rect_to_variant(this._target_rect));
            return;
        }

        const handler = this.connect('notify::target_rect', () => {
            this.disconnect(handler);
            invocation.return_value(meta_rect_to_variant(this._target_rect));
        });
    }

    get TargetRect() {
        this.emit('refresh-target-rect');
        return this._target_rect ? meta_rect_to_list(this._target_rect) : null;
    }

    get Version() {
        return this.version;
    }

    get Revision() {
        return this.revision;
    }

    get target_rect() {
        return this._target_rect;
    }

    set target_rect(value) {
        if (this._target_rect === value || this._target_rect?.equal(value))
            return;

        this._target_rect = value;
        this.notify('target-rect');

        this.dbus.emit_property_changed('TargetRect', meta_rect_to_variant(value));
        this.dbus.flush();
    }
});
