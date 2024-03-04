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

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';

import { sd_journal_stream_fd } from './sd_journal.js';

const SIGTERM = 15;

const STDOUT_FD = 1;
const STDERR_FD = 2;

const KEEP_LOG_LINES = 50;

function make_subprocess_launcher_journald(journal_identifier) {
    const subprocess_launcher = Gio.SubprocessLauncher.new(Gio.SubprocessFlags.NONE);

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

    return subprocess_launcher;
}

function make_subprocess_launcher_fallback() {
    return Gio.SubprocessLauncher.new(
        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_MERGE
    );
}

class JournalctlLogCollector {
    constructor(journalctl, since, pid) {
        this._argv = [
            journalctl,
            '--user',
            '-b',
            `--since=${since.format('%C%y-%m-%d %H:%M:%S UTC')}`,
            '-ocat',
            `-n${KEEP_LOG_LINES}`,
            `_PID=${pid}`,
        ];
    }

    _begin(resolve, reject) {
        const proc = Gio.Subprocess.new(
            this._argv,
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_MERGE
        );

        proc.communicate_utf8_async(null, null, this._finish.bind(this, resolve, reject));
    }

    _finish(resolve, reject, source, result) {
        try {
            const [, stdout_buf] = source.communicate_utf8_finish(result);
            resolve(stdout_buf);
        } catch (ex) {
            reject(ex);
        }
    }

    collect() {
        return new Promise(this._begin.bind(this));
    }
}

class TeeLogCollector {
    constructor(stream) {
        this._stream = Gio.DataInputStream.new(stream);
        this._stderr = Gio.UnixOutputStream.new(STDERR_FD, false);
        this._collected = [];
        this._promise = new Promise(resolve => {
            this._resolve = resolve;
        });

        this._read_more();
    }

    _read_more() {
        this._stream.read_line_async(GLib.PRIORITY_DEFAULT, null, this._read_done.bind(this));
    }

    _read_done(source, result) {
        const [line] = source.read_line_finish(result);

        if (line === null) {
            this._stream.close(null);
            this._stderr.close(null);
            this._resolve();
            return;
        }

        this._collected.push(line);

        while (this._collected.length > KEEP_LOG_LINES)
            this._collected.shift();

        this._stderr.write(line, null);
        this._stderr.write('\n', null);
        this._read_more();
    }

    async collect() {
        await this._promise;
        // BEGIN !ESM
        if (!globalThis.TextDecoder)
            return this._collected.map(line => imports.byteArray.toString(line)).join('\n');
        // END !ESM
        const decoder = new TextDecoder();
        return this._collected.map(line => decoder.decode(line)).join('\n');
    }
}

function make_wayland_client(subprocess_launcher) {
    try {
        return Meta.WaylandClient.new(global.context, subprocess_launcher);
    } catch {
        return Meta.WaylandClient.new(subprocess_launcher);
    }
}

export const Subprocess = GObject.registerClass({
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

        const start_date = GLib.DateTime.new_now_utc();
        const journalctl = GLib.find_program_in_path('journalctl');
        const logging_to_journald = journalctl && GLib.log_writer_is_journald?.(STDOUT_FD);
        const subprocess_launcher = logging_to_journald
            ? make_subprocess_launcher_journald(this.journal_identifier)
            : make_subprocess_launcher_fallback();

        const launch_context = global.create_app_launch_context(0, -1);

        subprocess_launcher.set_environ(launch_context.get_environment());

        try {
            this._subprocess = this._spawn(subprocess_launcher);
        } finally {
            subprocess_launcher.close();
        }

        this.log_collector = logging_to_journald
            ? new JournalctlLogCollector(journalctl, start_date, this._subprocess.get_identifier())
            : new TeeLogCollector(this._subprocess.get_stdout_pipe());
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

    wait_check(cancellable = null) {
        return new Promise((resolve, reject) => {
            this.g_subprocess.wait_check_async(cancellable, (source, result) => {
                try {
                    resolve(source.wait_check_finish(result));
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

export const WaylandSubprocess = GObject.registerClass({
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
