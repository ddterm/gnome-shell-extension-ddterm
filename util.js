'use strict';

/* exported parse_rgba UtilMixin */

const { GObject, Gdk } = imports.gi;

function parse_rgba(s) {
    if (!s)
        return null;

    const v = new Gdk.RGBA();

    if (v.parse(s))
        return v;

    return null;
}

// Signal connections and settings bindings, with lifetime bound to lifetime of 'this'
var UtilMixin = {
    run_on_destroy(func, obj = null) {
        let this_destroy_id = null, obj_destroy_id = null;

        const disconnect_func = () => {
            if (this_destroy_id)
                GObject.signal_handler_disconnect(this, this_destroy_id);

            if (obj_destroy_id)
                GObject.signal_handler_disconnect(obj, obj_destroy_id);

            func();
            obj = null;
        };

        this_destroy_id = GObject.signal_connect(this, 'destroy', disconnect_func);

        if (obj !== null && obj !== this && GObject.signal_lookup('destroy', obj.constructor.$gtype))
            obj_destroy_id = GObject.signal_connect(obj, 'destroy', disconnect_func);
    },

    disconnect_on_destroy(obj, handler_id) {
        this.run_on_destroy(
            GObject.signal_handler_disconnect.bind(null, obj, handler_id),
            obj
        );
        return handler_id;
    },

    signal_connect(source, signal, handler) {
        return this.disconnect_on_destroy(
            source, GObject.signal_connect(source, signal, handler)
        );
    },

    method_handler(source, signal, method) {
        return this.signal_connect(source, signal, method.bind(this));
    },
};
