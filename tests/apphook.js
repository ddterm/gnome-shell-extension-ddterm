// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gdk from 'gi://Gdk';

import System from 'system';

function intern_string(str) {
    // Otherwise dynamically generated strings don't work in __heapgraph_name
    return Symbol.for(str).description;
}

function get_heapgraph_name(obj) {
    const gtypename = intern_string(GObject.type_name_from_instance(obj));

    if (obj instanceof Gio.Action)
        return intern_string(`${gtypename}(${obj.name})`);

    return gtypename;
}

function set_heapgraph_name(obj) {
    if (!obj.__heapgraph_name)
        obj.__heapgraph_name = get_heapgraph_name(obj);
}

const old_object_init = GObject.Object.prototype._init;

GObject.Object.prototype._init = function (...args) {
    const result = old_object_init.call(this, ...args);

    set_heapgraph_name(result ?? this);

    return result;
};

const old_connect = GObject.Object.prototype.connect;

GObject.Object.prototype.connect = function connect(signal, handler) {
    set_heapgraph_name(this);

    handler.__heapgraph_name = intern_string(`${this.__heapgraph_name}::${signal}`);

    return old_connect.call(this, signal, handler);
};

const old_connect_after = GObject.Object.prototype.connect_after;

GObject.Object.prototype.connect_after = function connect_after(signal, handler) {
    set_heapgraph_name(this);

    handler.__heapgraph_name = intern_string(`${this.__heapgraph_name}::${signal}`);

    return old_connect_after.call(this, signal, handler);
};

const old_bind_property = GObject.Object.prototype.bind_property;

GObject.Object.prototype.bind_property = function bind_property(
    source_property,
    target,
    target_property,
    flags
) {
    set_heapgraph_name(this);
    set_heapgraph_name(target);

    return old_bind_property.call(this, source_property, target, target_property, flags);
};

const old_bind_property_full = GObject.Object.prototype.bind_property_full;

GObject.Object.prototype.bind_property_full = function bind_property_full(
    source_property,
    target,
    target_property,
    flags,
    transform_to,
    transform_from
) {
    set_heapgraph_name(this);
    set_heapgraph_name(target);

    return old_bind_property_full.call(
        this,
        source_property,
        target,
        target_property,
        flags,
        transform_to,
        transform_from
    );
};

const old_settings_bind = Gio.Settings.prototype.bind;

Gio.Settings.prototype.bind = function bind(key, object, property, flags) {
    set_heapgraph_name(this);
    set_heapgraph_name(object);

    return old_settings_bind.call(this, key, object, property, flags);
};

const old_settings_bind_writable = Gio.Settings.prototype.bind_writable;

Gio.Settings.prototype.bind_writable = function bind_writable(key, object, property, inverted) {
    set_heapgraph_name(this);
    set_heapgraph_name(object);

    return old_settings_bind_writable.call(this, key, object, property, inverted);
};

const [DBUS_INTROSPECTION_FILE] = GLib.filename_from_uri(
    GLib.Uri.resolve_relative(
        import.meta.url,
        './dbus-interfaces/com.github.amezin.ddterm.Debug.xml',
        GLib.UriFlags.NONE
    )
);

const DBUS_INTERFACE_INFO = Gio.DBusInterfaceInfo.new_for_xml(
    new TextDecoder().decode(GLib.file_get_contents(DBUS_INTROSPECTION_FILE)[1])
);

function return_error(invocation, ex) {
    if (ex instanceof GLib.Error) {
        invocation.return_gerror(ex);
        return;
    }

    let name = ex.name;
    if (!name.includes('.'))
        name = `org.gnome.gjs.JSError.${name}`;

    invocation.return_dbus_error(name, ex.toString());
}

class DebugInterface {
    constructor(app) {
        this.dbus = Gio.DBusExportedObject.wrapJSObject(DBUS_INTERFACE_INFO, this);

        this.app = app;
        this.app.connect('notify::window', () => {
            this.connect_window(app.window);
        });

        this.connect_window(app.window);

        this.dbus.export(Gio.DBus.session, '/com/github/amezin/ddterm');
        this.dbus.emit_property_changed('Connected', GLib.Variant.new_boolean(this.Connected));
    }

    connect_window(win) {
        if (this.window === win)
            return;

        while (this.disconnect_callbacks?.length)
            this.disconnect_callbacks.pop()();

        this.window = win;

        if (!win)
            return;

        const connect = (obj, signal, handler) => {
            const handler_id = obj.connect(signal, handler);

            return () => obj.disconnect(handler_id);
        };

        this.disconnect_callbacks = [
            connect(win, 'destroy', () => {
                if (win === this.window)
                    this.connect_window(null);
            }),
            connect(win, 'event', (_, event) => {
                this.emit_event(event);

                return false;
            }),
            connect(win, 'configure-event', () => {
                this.emit_configure_event(win.get_size());

                return false;
            }),
            connect(win, 'window-state-event', () => {
                this.emit_window_state_event(win.window.get_state());

                return false;
            }),
            connect(win, 'size-allocate', (_, rect) => {
                this.emit_size_allocate(rect);
            }),
        ];

        const notify_num_tabs = this.notify_num_tabs.bind(this);

        for (const notebook of [win.paned.get_child1(), win.paned.get_child2()]) {
            this.disconnect_callbacks.push(connect(notebook, 'page-added', notify_num_tabs));
            this.disconnect_callbacks.push(connect(notebook, 'page-removed', notify_num_tabs));
        }

        this.disconnect_callbacks.push(notify_num_tabs);
        this.notify_num_tabs();
    }

    emit_event(event) {
        const type = GObject.enum_to_string(Gdk.EventType, event.get_event_type());

        this.dbus.emit_signal(
            'WindowEvent',
            GLib.Variant.new_tuple([GLib.Variant.new_string(type)])
        );
    }

    emit_configure_event([width, height]) {
        this.dbus.emit_signal(
            'ConfigureEvent',
            GLib.Variant.new_tuple([GLib.Variant.new_int32(width), GLib.Variant.new_int32(height)])
        );
    }

    emit_window_state_event(state) {
        state = GObject.flags_to_string(Gdk.WindowState, state).split(' | ');

        this.dbus.emit_signal(
            'WindowStateEvent',
            GLib.Variant.new_tuple([GLib.Variant.new_strv(state)])
        );
    }

    emit_size_allocate(rect) {
        const { width, height } = rect;

        this.dbus.emit_signal(
            'SizeAllocate',
            GLib.Variant.new_tuple([GLib.Variant.new_int32(width), GLib.Variant.new_int32(height)])
        );
    }

    EvalAsync(params, invocation) {
        const [code] = params;

        try {
            Promise.resolve(eval(code)).then(result => {
                const json = result === undefined ? '' : JSON.stringify(result);

                invocation.return_value(GLib.Variant.new_tuple([GLib.Variant.new_string(json)]));
            }).catch(e => {
                return_error(invocation, e);
            });
        } catch (ex) {
            return_error(invocation, ex);
        }
    }

    WaitFrameAsync(params, invocation) {
        try {
            const frame_clock = this.window.window.get_frame_clock();

            const handler = frame_clock.connect_after('after-paint', () => {
                frame_clock.disconnect(handler);
                invocation.return_value(null);
            });

            frame_clock.request_phase(Gdk.FrameClockPhase.AFTER_PAINT);
        } catch (ex) {
            return_error(invocation, ex);
        }
    }

    WaitIdleAsync(params, invocation) {
        try {
            GLib.idle_add(GLib.PRIORITY_LOW, () => {
                invocation.return_value(null);

                return GLib.SOURCE_REMOVE;
            });
        } catch (ex) {
            return_error(invocation, ex);
        }
    }

    GC() {
        System.gc();
    }

    DumpHeapAsync(params, dump_heap_dbus_invocation) {
        dump_heap_dbus_invocation.__heapgraph_name = 'DumpHeapDBusInvocation';
        const [path] = params;
        params = null;

        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            try {
                System.gc();
                System.dumpHeap(path);
                dump_heap_dbus_invocation.return_value(null);
            } catch (ex) {
                return_error(dump_heap_dbus_invocation, ex);
            }

            return GLib.SOURCE_REMOVE;
        });
    }

    ActivateAction(detailed_action) {
        const [, action_name, target_value] = Gio.Action.parse_detailed_name(detailed_action);

        let deepest_scope = this.app;

        if (deepest_scope?.window) {
            deepest_scope = deepest_scope.window;

            const focus_widget = deepest_scope.get_focus();

            if (focus_widget)
                deepest_scope = focus_widget;
        }

        const [prefix, name] = action_name.split('.');
        const actions = deepest_scope.get_action_group(prefix);

        actions.activate_action(name, target_value);
    }

    get Connected() {
        return true;
    }

    get NumTabs() {
        if (!this.window)
            return 0;

        const { paned } = this.window;

        return paned.get_child1().get_n_pages() + paned.get_child2().get_n_pages();
    }

    notify_num_tabs() {
        this.dbus.emit_property_changed('NumTabs', GLib.Variant.new_uint32(this.NumTabs));
    }
}

new DebugInterface(Gio.Application.get_default());
