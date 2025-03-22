#!/usr/bin/env gjs

// SPDX-FileCopyrightText: 2025 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

'use strict';

imports.gi.versions.Gtk = '4.0';

const { GObject, Gio, Gtk } = imports.gi;

const System = imports.system;

const Application = GObject.registerClass({
}, class Application extends Gtk.Application {
    _init(params) {
        super._init(params);

        this.connect('startup', this.startup.bind(this));
        this.connect('activate', this.activate.bind(this));
    }

    startup() {
        const quit_action = new Gio.SimpleAction({ name: 'quit' });
        quit_action.connect('activate', () => this.quit());
        this.add_action(quit_action);

        this.window = new Gtk.ApplicationWindow({
            application: this,
            maximized: true,
        });
    }

    activate() {
        this.window.present();
    }
});

const app = new Application({ application_id: 'com.github.ddterm.DummyApp' });

app.run([System.programInvocationName].concat(ARGV));
