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

const Me = imports.misc.extensionUtils.getCurrentExtension();
const { sd_journal_stream_fd } = Me.imports.ddterm.shell.sd_journal;

const SIGTERM = 15;

function make_subprocess_launcher(journal_identifier) {
    const subprocess_launcher = Gio.SubprocessLauncher.new(Gio.SubprocessFlags.NONE);

    if (GLib.log_writer_is_journald?.(1)) {
        /* eslint-disable max-len */
        /*
         * ShellApp.launch() connects to journald from the main GNOME Shell process too:
         * https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/51dc50144ecacc9ac1f807dcc6bdf4f1d49343ae/src/shell-app.c#L1452
         * So shouldn't be a problem here too.
         */
        try {
            const fd = sd_journal_stream_fd(journal_identifier);
            subprocess_launcher.take_stdout_fd(fd);
            subprocess_launcher.set_flags(Gio.SubprocessFlags.STDERR_MERGE);
        } catch (ex) {
            logError(ex, "Can't connect to systemd-journald");
        }
    }

    return subprocess_launcher;
}

function make_wayland_client(subprocess_launcher) {
    try {
        return Meta.WaylandClient.new(global.context, subprocess_launcher);
    } catch {
        return Meta.WaylandClient.new(subprocess_launcher);
    }
}

var Subprocess = GObject.registerClass({
    Properties: {
        'journal-identifier': GObject.ParamSpec.string(
            'journal-identifier',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            null
        ),
        'argv': GObject.ParamSpec.boxed(
            'argv',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            GObject.type_from_name('GStrv')
        ),
        'g-subprocess': GObject.ParamSpec.object(
            'g-subprocess',
            '',
            '',
            GObject.ParamFlags.READABLE,
            Gio.Subprocess
        ),
    },
}, class DDTermSubprocess extends GObject.Object {
    _init(params) {
        super._init(params);

        const subprocess_launcher = make_subprocess_launcher(this.journal_identifier);

        try {
            this._subprocess = this._spawn(subprocess_launcher);
        } finally {
            subprocess_launcher.close();
        }

        this.wait().then(() => {
            const name = this.argv[0];

            if (this.g_subprocess.get_if_signaled()) {
                const signum = this.g_subprocess.get_term_sig();
                const strsig = GLib.strsignal(signum);

                log(`${name} killed by signal ${signum} (${strsig})`);
            } else {
                const status = this.g_subprocess.get_exit_status();

                log(`${name} exited with status ${status}`);
            }
        }).catch(logError);
    }

    get g_subprocess() {
        return this._subprocess;
    }

    owns_window(win) {
        return win.get_pid().toString() === this.g_subprocess.get_identifier();
    }

    wait(cancellable = null) {
        return new Promise((resolve, reject) => {
            this.g_subprocess.wait_async(cancellable, (source, result) => {
                try {
                    resolve(source.wait_finish(result));
                } catch (ex) {
                    reject(ex);
                }
            });
        });
    }

    terminate() {
        this.g_subprocess.send_signal(SIGTERM);
    }

    _spawn(subprocess_launcher) {
        log(`Starting subprocess: ${JSON.stringify(this.argv)}`);
        return subprocess_launcher.spawnv(this.argv);
    }
});

var WaylandSubprocess = GObject.registerClass({
    Properties: {
        'wayland-client': GObject.ParamSpec.object(
            'wayland-client',
            '',
            '',
            GObject.ParamFlags.READABLE,
            Meta.WaylandClient
        ),
    },
}, class DDTermWaylandSubprocess extends Subprocess {
    owns_window(win) {
        return this.wayland_client.owns_window(win);
    }

    _spawn(subprocess_launcher) {
        log(`Starting wayland client subprocess: ${JSON.stringify(this.argv)}`);
        this._wayland_client = make_wayland_client(subprocess_launcher);
        return this._wayland_client.spawnv(global.display, this.argv);
    }

    get wayland_client() {
        return this._wayland_client;
    }
});

/* exported Subprocess WaylandSubprocess */
