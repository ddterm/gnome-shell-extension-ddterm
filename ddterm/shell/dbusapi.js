// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

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
        'target-monitor-scale': GObject.ParamSpec.double(
            'target-monitor-scale',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            0,
            100,
            1
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
        'update-target-monitor': {},
    },
}, class DDTermDBusApi extends GObject.Object {
    _init(params) {
        super._init(params);

        this._target_rect = new Mtk.Rectangle({ x: 0, y: 0, width: 0, height: 0 });
        this._target_monitor_scale = 1;

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

    GetTargetRect() {
        this.emit('update-target-monitor');
        return meta_rect_to_list(this._target_rect);
    }

    GetTargetMonitorScale() {
        this.emit('update-target-monitor');
        return this._target_monitor_scale;
    }

    get TargetRect() {
        return this.GetTargetRect();
    }

    get TargetMonitorScale() {
        return this.GetTargetMonitorScale();
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
        if (this._target_rect.equal(value))
            return;

        this._target_rect = value;
        this.notify('target-rect');

        this.dbus.emit_property_changed('TargetRect', meta_rect_to_variant(value));
    }

    get target_monitor_scale() {
        return this._target_monitor_scale;
    }

    set target_monitor_scale(value) {
        if (this._target_monitor_scale === value)
            return;

        this._target_monitor_scale = value;
        this.notify('target-monitor-scale');

        this.dbus.emit_property_changed('TargetMonitorScale', GLib.Variant.new_double(value));
    }
});
