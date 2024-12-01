import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';

export function report_dbus_error_async(e, invocation) {
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

export function handle_dbus_call_promise(invocation, promise_func) {
    new Promise(promise_func).then(result => {
        const result_signature =
            `(${invocation.get_method_info().out_args.map(arg => arg.signature).join('')})`;

        if (invocation.get_method_info().out_args.length === 1)
            result = [result];

        invocation.return_value(
            result === undefined ? null : new GLib.Variant(result_signature, result)
        );
    }).catch(e => {
        report_dbus_error_async(e, invocation);
    });
}

export function connect(source, signal, target) {
    const handler_id = source.connect(signal, target);

    return () => source.disconnect(handler_id);
}

export function connect_after(source, signal, target) {
    const handler_id = source.connect_after(signal, target);

    return () => source.disconnect(handler_id);
}

export function get_main() {
    const api_version = Shell.__version__;

    log(`Shell API version: ${JSON.stringify(api_version)}`);

    if (Number.parseInt(api_version) >= 13)
        return import('resource:///org/gnome/shell/ui/main.js');

    return Promise.resolve(imports.ui.main);
}

export function get_resource_path(file_or_relative_url) {
    const [path] = GLib.filename_from_uri(
        GLib.Uri.resolve_relative(import.meta.url, file_or_relative_url, GLib.UriFlags.NONE)
    );

    return path;
}

export function get_resource_content(file_or_relative_url) {
    return Shell.get_file_contents_utf8_sync(get_resource_path(file_or_relative_url));
}

export function get_resource_dbus_interface_info(file_or_relative_url) {
    return Gio.DBusInterfaceInfo.new_for_xml(get_resource_content(file_or_relative_url));
}

const DBUS_AUTO_PSPEC_FLAGS = GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY;

function dbus_auto_pspec_str(name) {
    return GObject.ParamSpec.string(name, '', '', DBUS_AUTO_PSPEC_FLAGS, '');
}

function dbus_auto_pspec_strv(name) {
    return GObject.ParamSpec.boxed(
        name,
        '',
        '',
        DBUS_AUTO_PSPEC_FLAGS,
        GObject.type_from_name('GStrv')
    );
}

const DBUS_AUTO_PSPEC_FACTORIES = {
    's': dbus_auto_pspec_str,
    'o': dbus_auto_pspec_str,
    'g': dbus_auto_pspec_str,
    'as': dbus_auto_pspec_strv,
    'ao': dbus_auto_pspec_strv,
    'ag': dbus_auto_pspec_strv,
    'b': name => GObject.ParamSpec.boolean(
        name,
        '',
        '',
        DBUS_AUTO_PSPEC_FLAGS,
        false
    ),
    'y': name => GObject.ParamSpec.uchar(
        name,
        '',
        '',
        DBUS_AUTO_PSPEC_FLAGS,
        0,
        GLib.MAXUINT8,
        0
    ),
    'n': name => GObject.ParamSpec.int(
        name,
        '',
        '',
        DBUS_AUTO_PSPEC_FLAGS,
        GLib.MININT16,
        GLib.MAXINT16,
        0
    ),
    'q': name => GObject.ParamSpec.uint(
        name,
        '',
        '',
        DBUS_AUTO_PSPEC_FLAGS,
        0,
        GLib.MAXUINT16,
        0
    ),
    'i': name => GObject.ParamSpec.int(
        name,
        '',
        '',
        DBUS_AUTO_PSPEC_FLAGS,
        GLib.MININT32,
        GLib.MAXINT32,
        0
    ),
    'u': name => GObject.ParamSpec.uint(
        name,
        '',
        '',
        DBUS_AUTO_PSPEC_FLAGS,
        0,
        GLib.MAXUINT32,
        0
    ),
    'x': name => GObject.ParamSpec.int64(
        name,
        '',
        '',
        DBUS_AUTO_PSPEC_FLAGS,
        GLib.MININT64,
        GLib.MAXINT64,
        0
    ),
    't': name => GObject.ParamSpec.uint64(
        name,
        '',
        '',
        DBUS_AUTO_PSPEC_FLAGS,
        0,
        GLib.MAXUINT64,
        0
    ),
    'd': name => GObject.ParamSpec.double(
        name,
        '',
        '',
        DBUS_AUTO_PSPEC_FLAGS,
        Number.NEGATIVE_INFINITY,
        Number.POSITIVE_INFINITY,
        0
    ),
};

function dbus_auto_pspec_jsobject(name) {
    return GObject.ParamSpec.jsobject(name, '', '', DBUS_AUTO_PSPEC_FLAGS);
}

export function dbus_auto_pspecs(interface_info) {
    if (!(interface_info instanceof Gio.DBusInterfaceInfo))
        interface_info = Gio.DBusInterfaceInfo.new_for_xml(interface_info);

    return Object.fromEntries(
        interface_info.properties.map(property_info => {
            const { name, signature } = property_info;
            const factory = DBUS_AUTO_PSPEC_FACTORIES[signature] ?? dbus_auto_pspec_jsobject;

            return [name, factory(name)];
        })
    );
}
