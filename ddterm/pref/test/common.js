// SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';

import Gettext from 'gettext';
import System from 'system';

import '../../../tools/heapgraph.js';

export function wait_signal(object, signal) {
    return new Promise(resolve => {
        console.log('Waiting for signal %o on %s', signal, object);

        const handler = object.connect_after(signal, (...args) => {
            console.log('Received signal %o on %s', signal, object);
            object.disconnect(handler);
            resolve(args);
        });
    });
}

function wait_frame(widget) {
    return new Promise(resolve => {
        const frame_clock = widget.get_frame_clock();
        const promise = wait_signal(frame_clock, 'after-paint');

        frame_clock.request_phase(Gdk.FrameClockPhase.AFTER_PAINT);
        resolve(promise);
    });
}

function wait_idle() {
    return new Promise(resolve => {
        GLib.idle_add(GLib.PRIORITY_LOW, () => {
            resolve();

            return GLib.SOURCE_REMOVE;
        });
    });
}

export const Application = GObject.registerClass({
}, class Application extends Gtk.Application {
    constructor(params) {
        super(params);

        this.add_main_option(
            'base-url',
            0,
            GLib.OptionFlags.NONE,
            GLib.OptionArg.STRING,
            '',
            null
        );

        this.add_main_option(
            'heap-dump-1',
            0,
            GLib.OptionFlags.NONE,
            GLib.OptionArg.STRING,
            '',
            null
        );

        this.add_main_option(
            'heap-dump-2',
            0,
            GLib.OptionFlags.NONE,
            GLib.OptionArg.STRING,
            '',
            null
        );

        this.connect('startup', () => {
            this.startup_promise = this.startup().catch(logError);
        });

        this.connect('activate', () => this.activate().catch(logError));
        this.connect('handle-local-options', (app, options) => this.handle_local_options(options));
    }

    handle_local_options(options) {
        this.base_url = options.lookup('base-url', 's');

        if (this.base_url) {
            if (!this.base_url.endsWith('/'))
                this.base_url += '/';
        } else {
            this.base_url = GLib.Uri.resolve_relative(
                import.meta.url,
                '../../..',
                GLib.UriFlags.NONE
            );
        }

        this.heap_dumps = [
            options.lookup('heap-dump-1', 's'),
            options.lookup('heap-dump-2', 's'),
        ].filter(v => v);

        return -1;
    }

    resolve_relative(url) {
        return GLib.Uri.resolve_relative(this.base_url, url, GLib.UriFlags.NONE);
    }

    async startup() {
        this.hold();

        try {
            const { dir, get_settings, metadata } =
                await import(this.resolve_relative('ddterm/app/meta.js'));

            const { DisplayConfig } =
                await import(this.resolve_relative('ddterm/util/displayconfig.js'));

            Gettext.bindtextdomain(
                metadata['gettext-domain'],
                dir.get_child('locale').get_path()
            );

            this.settings = get_settings();
            this.gettext_domain = Gettext.domain(metadata['gettext-domain']);
            this.display_config = DisplayConfig.new();

            this.connect('shutdown', () => this.display_config.unwatch());
        } finally {
            this.release();
        }
    }

    async activate() {
        this.hold();

        try {
            await this.startup_promise;

            if (this.heap_dumps.length) {
                for (const heap_dump of this.heap_dumps) {
                    await this.do_test(); // eslint-disable-line no-await-in-loop

                    for (let i = 0; i < 10; i++) {
                        System.gc();
                        await wait_idle(); // eslint-disable-line no-await-in-loop
                    }

                    System.dumpHeap(heap_dump);
                }
            } else {
                await this.preferences();
            }
        } finally {
            this.release();
        }
    }

    async do_test() {
        let dialog = await this.preferences();

        await wait_frame(dialog);
        await wait_idle();

        dialog.close();
    }

    async preferences() {
        const { PrefsDialog } =
            await import(this.resolve_relative('ddterm/app/prefsdialog.js'));

        const prefs_dialog = new PrefsDialog({
            settings: this.settings,
            display_config: this.display_config,
            application: this,
        });

        prefs_dialog.show();

        return prefs_dialog;
    }
});
