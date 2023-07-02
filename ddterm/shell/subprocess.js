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

const SIGTERM = 15;

var Subprocess = GObject.registerClass(
    {
        Properties: {
            'g-subprocess': GObject.ParamSpec.object(
                'g-subprocess',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                Gio.Subprocess
            ),
            'wayland-client': GObject.ParamSpec.object(
                'wayland-client',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                Meta.WaylandClient
            ),
        },
    },
    class DDTermSubprocess extends GObject.Object {
        _init(params) {
            super._init(params);

            this.wait().then(() => {
                const name = this.g_subprocess.argv[0];

                if (this.g_subprocess.get_if_signaled()) {
                    const signum = this.g_subprocess.get_term_sig();
                    const strsig = GLib.strsignal(signum);

                    log(`${name} killed by signal ${signum} (${strsig})`);
                } else {
                    const status = this.g_subprocess.get_exit_status();

                    log(`${name} exited with status ${status}`);
                }
            });
        }

        owns_window(win) {
            if (win.get_client_type() === Meta.WindowClientType.WAYLAND)
                return this.wayland_client && this.wayland_client.owns_window(win);
            else
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
    }
);

function make_wayland_client(subprocess_launcher) {
    if (!Meta.is_wayland_compositor())
        return null;

    try {
        return Meta.WaylandClient.new(global.context, subprocess_launcher);
    } catch {
        return Meta.WaylandClient.new(subprocess_launcher);
    }
}

function spawn(argv) {
    const subprocess_launcher = Gio.SubprocessLauncher.new(Gio.SubprocessFlags.NONE);
    const wayland_client = make_wayland_client(subprocess_launcher);

    if (wayland_client)
        log(`Starting wayland client subprocess: ${JSON.stringify(argv)}`);
    else
        log(`Starting subprocess: ${JSON.stringify(argv)}`);

    if (wayland_client) {
        return new Subprocess({
            g_subprocess: wayland_client.spawnv(global.display, argv),
            wayland_client,
        });
    } else {
        return new Subprocess({ g_subprocess: subprocess_launcher.spawnv(argv) });
    }
}

/* exported Subprocess spawn */
