// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
// SPDX-FileContributor: Timothy J. Aveni
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Mtk from 'gi://Mtk';

import { AppControl } from './appcontrol.js';

function report_dbus_error_async(e, invocation) {
    if (e instanceof GLib.Error) {
        invocation.return_gerror(e);
        return;
    }

    let { name } = e;
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

function get_file_contents(file) {
    return new Promise((resolve, reject) => {
        file.load_contents_async(null, (source, result) => {
            try {
                const [, contents] = source.load_contents_finish(result);

                resolve(new TextDecoder().decode(contents));
            } catch (ex) {
                reject(ex);
            }
        });
    });
}

export class DBusApi extends GObject.Object {
    static [GObject.GTypeName] = 'DDTermDBusApi';

    static [GObject.properties] = {
        'version': GObject.ParamSpec.string(
            'version',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            null
        ),
        'revision': GObject.ParamSpec.string(
            'revision',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            null
        ),
        'app-control': GObject.ParamSpec.object(
            'app-control',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            AppControl
        ),
        'target-rect': GObject.ParamSpec.boxed(
            'target-rect',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            Mtk.Rectangle
        ),
        'target-monitor-scale': GObject.ParamSpec.double(
            'target-monitor-scale',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            0,
            100,
            0
        ),
        'has-window': GObject.ParamSpec.boolean(
            'has-window',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            false
        ),
    };

    static [GObject.signals] = {
        'missing-dependencies': {
            param_types: [GObject.type_from_name('GStrv'), GObject.type_from_name('GStrv')],
        },
        'error': {
            param_types: [String, String],
        },
        'version-mismatch': {},
        'update-target-monitor': {},
    };

    static {
        GObject.registerClass(this);
    }

    #target_rect;
    #target_monitor_scale;
    #version;
    #revision;
    #dbus_wrapper;
    #has_window;

    constructor(params) {
        super(params);

        if (this.version)
            this.#version = GLib.Variant.new_string(this.version);

        if (this.revision)
            this.#revision = GLib.Variant.new_string(this.revision);
    }

    async export() {
        const introspection_file = Gio.File.new_for_uri(
            GLib.Uri.resolve_relative(
                import.meta.url,
                '../../data/com.github.amezin.ddterm.Extension.xml',
                GLib.UriFlags.NONE
            )
        );

        const interface_info = Gio.DBusInterfaceInfo.new_for_xml(
            await get_file_contents(introspection_file)
        );

        this.unexport();

        this.#dbus_wrapper = Gio.DBusExportedObject.wrapJSObject(interface_info, this);
        this.#dbus_wrapper.export(Gio.DBus.session, '/org/gnome/Shell/Extensions/ddterm');

        // Make sure the app gets new rect and scale if the extension was temporarily disabled.
        // For example, during screen lock

        if (this.#target_rect)
            this.#dbus_wrapper.emit_property_changed('TargetRect', this.#target_rect);

        if (this.#target_monitor_scale) {
            this.#dbus_wrapper.emit_property_changed(
                'TargetMonitorScale',
                this.#target_monitor_scale
            );
        }
    }

    unexport() {
        this.#dbus_wrapper?.unexport();
        this.#dbus_wrapper = null;
    }

    flush() {
        this.#dbus_wrapper?.flush();
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

        if (!this.#target_rect) {
            throw new Gio.DBusError({
                code: Gio.DBusError.FAILED,
                message: 'Target rect cannot be calculated right now',
            });
        }

        return this.#target_rect;
    }

    GetTargetMonitorScale() {
        this.emit('update-target-monitor');

        if (!this.#target_monitor_scale) {
            throw new Gio.DBusError({
                code: Gio.DBusError.FAILED,
                message: 'Target monitor cannot be calculated right now',
            });
        }

        return GLib.Variant.new_tuple([this.#target_monitor_scale]);
    }

    get TargetRect() {
        this.emit('update-target-monitor');
        return this.#target_rect ?? undefined;
    }

    get TargetMonitorScale() {
        this.emit('update-target-monitor');
        return this.#target_monitor_scale ?? undefined;
    }

    get Version() {
        return this.#version;
    }

    get Revision() {
        return this.#revision;
    }

    get HasWindow() {
        return this.#has_window;
    }

    get target_rect() {
        const value = this.#target_rect;

        if (!value)
            return null;

        return new Mtk.Rectangle({
            x: value.get_child_value(0).get_int32(),
            y: value.get_child_value(1).get_int32(),
            width: value.get_child_value(2).get_int32(),
            height: value.get_child_value(3).get_int32(),
        });
    }

    set target_rect(value) {
        if (!value && !this.#target_rect)
            return;

        if (value) {
            value = GLib.Variant.new_tuple([
                GLib.Variant.new_int32(value.x),
                GLib.Variant.new_int32(value.y),
                GLib.Variant.new_int32(value.width),
                GLib.Variant.new_int32(value.height),
            ]);

            if (this.#target_rect?.equal(value))
                return;
        }

        this.#target_rect = value;
        this.notify('target-rect');
        this.#dbus_wrapper?.emit_property_changed('TargetRect', value);
    }

    get target_monitor_scale() {
        return this.#target_monitor_scale?.get_double() ?? 0.0;
    }

    set target_monitor_scale(value) {
        value = GLib.Variant.new_double(value);

        if (this.#target_monitor_scale?.equal(value))
            return;

        this.#target_monitor_scale = value;
        this.notify('target-monitor-scale');
        this.#dbus_wrapper?.emit_property_changed('TargetMonitorScale', value);
    }

    get has_window() {
        return this.#has_window?.get_boolean() ?? false;
    }

    set has_window(value) {
        if (this.#has_window?.get_boolean() === value)
            return;

        this.#has_window = GLib.Variant.new_boolean(value);
        this.notify('has-window');
        this.#dbus_wrapper?.emit_property_changed('HasWindow', this.#has_window);
        this.flush();
    }
}
