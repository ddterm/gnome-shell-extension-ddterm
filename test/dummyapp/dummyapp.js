#!/usr/bin/env gjs

'use strict';

imports.gi.versions.Gtk = '3.0';

const { GObject, Gtk } = imports.gi;

const System = imports.system;

const Application = GObject.registerClass({
}, class Application extends Gtk.Application {
    _init(params) {
        super._init(params);

        this.connect('startup', this.startup.bind(this));
        this.connect('activate', this.activate.bind(this));
    }

    startup() {
        this.window = new Gtk.ApplicationWindow({ application: this });
    }

    activate() {
        this.window.show();
    }
});

const app = new Application({ application_id: 'com.github.ddterm.testapp' });

app.run([System.programInvocationName].concat(ARGV));
