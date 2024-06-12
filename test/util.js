import GLib from 'gi://GLib';
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

    if (Number.parseInt(api_version) < 13)
        return Promise.resolve(imports.ui.main);

    return import('resource:///org/gnome/shell/ui/main.js');
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
