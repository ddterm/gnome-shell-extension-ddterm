// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GnomeDesktop from 'gi://GnomeDesktop';
import Meta from 'gi://Meta';

import Gi from 'gi';

import { sd_journal_stream_fd } from './sd_journal.js';

function try_require(namespace, version = undefined) {
    try {
        return Gi.require(namespace, version);
    } catch (ex) {
        logError(ex);
        return null;
    }
}

const GioUnix = GLib.check_version(2, 79, 2) === null ? try_require('GioUnix') : null;
const UnixOutputStream = GioUnix?.OutputStream ?? Gio.UnixOutputStream;

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

function shell_join(argv) {
    return argv.map(arg => GLib.shell_quote(arg)).join(' ');
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
        this._input = stream;
        this._output = new UnixOutputStream({ fd: STDERR_FD, close_fd: false });
        this._collected = [];
        this._collected_lines = 0;
        this._promise = new Promise((resolve, reject) => {
            this._resolve = resolve;
            this._reject = reject;
        });

        this._read_more();
    }

    _read_more() {
        this._input.read_bytes_async(4096, GLib.PRIORITY_DEFAULT, null, this._read_done.bind(this));
    }

    _read_done(source, result) {
        try {
            const chunk = source.read_bytes_finish(result).toArray();

            if (chunk.length === 0) {
                this._input.close(null);
                this._output.close(null);
                this._resolve();
                return;
            }

            const delimiter = '\n'.charCodeAt(0);
            let start = 0;

            for (;;) {
                let end = chunk.indexOf(delimiter, start);

                if (end === -1) {
                    if (start < chunk.length)
                        this._collected.push(chunk.subarray(start));

                    break;
                }

                this._collected.push(chunk.subarray(start, end + 1));
                this._collected_lines += 1;

                start = end + 1;
            }

            let remove = 0;

            while (this._collected_lines > KEEP_LOG_LINES) {
                const remove_chunk = this._collected[remove];

                remove += 1;

                if (remove_chunk[remove_chunk.length - 1] === delimiter)
                    this._collected_lines -= 1;
            }

            this._collected.splice(0, remove);
            this._output.write(chunk, null);
            this._read_more();
        } catch (ex) {
            this._reject(ex);
        }
    }

    async collect() {
        await this._promise;

        const decoder = new TextDecoder();
        return this._collected.map(line => decoder.decode(line)).join('\n');
    }
}

export const Subprocess = GObject.registerClass({
    Properties: {
        'journal-identifier': GObject.ParamSpec.string(
            'journal-identifier',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            null
        ),
        'argv': GObject.ParamSpec.boxed(
            'argv',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            GObject.type_from_name('GStrv')
        ),
        'environ': GObject.ParamSpec.boxed(
            'environ',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            GObject.type_from_name('GStrv')
        ),
        'g-subprocess': GObject.ParamSpec.object(
            'g-subprocess',
            null,
            null,
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

        for (const extra_env of this.environ) {
            const split_pos = extra_env.indexOf('=');
            const name = extra_env.slice(0, split_pos);
            const value = extra_env.slice(split_pos + 1);

            subprocess_launcher.setenv(name, value, true);
        }

        try {
            this._subprocess = this._spawn(subprocess_launcher);
        } finally {
            subprocess_launcher.close();
        }

        this.log_collector = logging_to_journald
            ? new JournalctlLogCollector(journalctl, start_date, this._subprocess.get_identifier())
            : new TeeLogCollector(this._subprocess.get_stdout_pipe());

        GnomeDesktop.start_systemd_scope(
            this.journal_identifier,
            parseInt(this._subprocess.get_identifier(), 10),
            null,
            null,
            null,
            null
        );
    }

    get g_subprocess() {
        return this._subprocess;
    }

    owns_window(win) {
        const win_pid = win.get_pid();

        if (!win_pid)
            return false;

        const identifier = this._subprocess.get_identifier();

        return identifier && identifier === win_pid.toString();
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
        log(`Starting subprocess: ${shell_join(this.argv)}`);
        return subprocess_launcher.spawnv(this.argv);
    }
});

const WaylandSubprocessLegacy = GObject.registerClass({
    Properties: {
        'wayland-client': GObject.ParamSpec.object(
            'wayland-client',
            null,
            null,
            GObject.ParamFlags.READABLE,
            Meta.WaylandClient
        ),
    },
}, class DDTermWaylandSubprocessLegacy extends Subprocess {
    owns_window(win) {
        return this.wayland_client.owns_window(win);
    }

    hide_from_window_list(win) {
        this._wayland_client.hide_from_window_list(win);
    }

    show_in_window_list(win) {
        this._wayland_client.show_in_window_list(win);
    }

    _spawn(subprocess_launcher) {
        log(`Starting wayland client subprocess: ${shell_join(this.argv)}`);

        if (Meta.WaylandClient.new.length === 1)
            this._wayland_client = Meta.WaylandClient.new(subprocess_launcher);
        else
            this._wayland_client = Meta.WaylandClient.new(global.context, subprocess_launcher);

        return this._wayland_client.spawnv(global.display, this.argv);
    }

    get wayland_client() {
        return this._wayland_client;
    }
});

const WaylandSubprocessNew = GObject.registerClass({
}, class DDTermWaylandSubprocess extends WaylandSubprocessLegacy {
    hide_from_window_list(win) {
        win.hide_from_window_list();
    }

    show_in_window_list(win) {
        win.show_in_window_list();
    }

    _spawn(subprocess_launcher) {
        log(`Starting wayland client subprocess: ${shell_join(this.argv)}`);

        this._wayland_client = Meta.WaylandClient.new_subprocess(
            global.context,
            subprocess_launcher,
            this.argv
        );

        return this._wayland_client.get_subprocess();
    }
});

export const WaylandSubprocess =
    Meta.WaylandClient.new_subprocess ? WaylandSubprocessNew : WaylandSubprocessLegacy;
