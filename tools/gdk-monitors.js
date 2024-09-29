#!/usr/bin/env gjs

imports.gi.versions.Gtk = '3.0';
imports.gi.versions.Gdk = '3.0';

const { Gtk, Gdk } = imports.gi;

const System = imports.system;

const app = Gtk.Application.new(null, 0);

function rect_json(r) {
    const { x, y, width, height } = r;

    return { x, y, width, height };
}

app.connect('activate', () => {
    const display = Gdk.Display.get_default();
    const monitors = Array.from(
        { length: display.get_n_monitors() },
        (_, i) => display.get_monitor(i)
    ).map(monitor => {
        let { manufacturer, model, geometry, scale_factor, workarea } = monitor;

        geometry = rect_json(geometry);
        workarea = rect_json(workarea);

        return { manufacturer, model, geometry, scale_factor, workarea };
    });

    print(JSON.stringify(monitors, null, 2));
});

System.exit(app.run([System.programInvocationName, ...System.programArgs]));
