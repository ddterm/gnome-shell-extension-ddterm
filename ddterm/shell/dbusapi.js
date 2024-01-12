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

'use strict';

const { GLib, GObject, Gio, Meta } = imports.gi;
const ByteArray = imports.byteArray;

const Me = imports.misc.extensionUtils.getCurrentExtension();

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

var Api = GObject.registerClass({
    Properties: {
        'target-rect': GObject.ParamSpec.boxed(
            'target-rect',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            Meta.Rectangle
        ),
        'revision': GObject.ParamSpec.string(
            'revision',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            ''
        ),
    },
    Signals: {
        'toggle': {
            return_type: GObject.TYPE_JSOBJECT,
            accumulator: GObject.AccumulatorType.FIRST_WINS,
        },
        'activate': {
            return_type: GObject.TYPE_JSOBJECT,
            accumulator: GObject.AccumulatorType.FIRST_WINS,
        },
        'hide': {
            return_type: GObject.TYPE_JSOBJECT,
            accumulator: GObject.AccumulatorType.FIRST_WINS,
        },
        'service': {
            return_type: GObject.TYPE_JSOBJECT,
            accumulator: GObject.AccumulatorType.FIRST_WINS,
        },
        'refresh-target-rect': {},
    },
}, class DDTermDBusApi extends GObject.Object {
    _init(params) {
        super._init(params);

        this._target_rect = new Meta.Rectangle({ x: 0, y: 0, width: 0, height: 0 });

        const xml_file =
            Me.dir.get_child('ddterm').get_child('com.github.amezin.ddterm.Extension.xml');

        const [_, xml] = xml_file.load_contents(null);
        this.dbus = Gio.DBusExportedObject.wrapJSObject(ByteArray.toString(xml), this);
    }

    ToggleAsync(params, invocation) {
        handle_dbus_method_call_async(() => this.emit('toggle'), params, invocation);
    }

    ActivateAsync(params, invocation) {
        handle_dbus_method_call_async(() => this.emit('activate'), params, invocation);
    }

    HideAsync(params, invocation) {
        handle_dbus_method_call_async(() => this.emit('hide'), params, invocation);
    }

    ServiceAsync(params, invocation) {
        handle_dbus_method_call_async(() => this.emit('service'), params, invocation);
    }

    GetTargetRect() {
        this.emit('refresh-target-rect');
        return meta_rect_to_list(this._target_rect);
    }

    get TargetRect() {
        return this.GetTargetRect();
    }

    get Version() {
        return `${Me.metadata.version}`;
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
        this.dbus.flush();
    }
});

/* exported Api */
