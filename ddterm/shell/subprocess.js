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
import { promisify } from '../util/promise.js';

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

async function collect_journald_logs(journalctl, since, pid) {
    const argv = [
        journalctl,
        '--user',
        '-b',
        `--since=${since.format('%C%y-%m-%d %H:%M:%S UTC')}`,
        '-ocat',
        `-n${KEEP_LOG_LINES}`,
    ];

    if (pid)
        argv.push(`_PID=${pid}`);

    const proc = Gio.Subprocess.new(
        argv,
        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_MERGE
    );

    const communicate = promisify(proc.communicate_async, proc.communicate_finish);
    const [, stdout_buf] = await communicate.call(proc, null, null);

    return new TextDecoder().decode(stdout_buf);
}

async function *read_chunks(input_stream) {
    const read_bytes =
        promisify(input_stream.read_bytes_async, input_stream.read_bytes_finish);

    try {
        for (;;) {
            // eslint-disable-next-line no-await-in-loop
            const chunk = await read_bytes.call(input_stream, 4096, GLib.PRIORITY_DEFAULT, null);

            if (chunk.get_size() === 0)
                return;

            yield chunk.toArray();
        }
    } finally {
        input_stream.close(null);
    }
}

function *split_array_keep_delimiter(bytes, delimiter) {
    let start = 0;

    for (;;) {
        let end = bytes.indexOf(delimiter, start);

        if (end === -1)
            break;

        yield bytes.subarray(start, end + 1);

        start = end + 1;
    }

    yield bytes.subarray(start);
}

async function collect_stdio_logs(input_stream) {
    const delimiter = '\n'.charCodeAt(0);
    const collected = [];
    let lines = 0;
    const stderr = new UnixOutputStream({ fd: STDERR_FD, close_fd: false });

    for await (const chunk of read_chunks(input_stream)) {
        // I hope sync/blocking writes to stderr are fine.
        // After all, this is the same thing that printerr() does.
        stderr.write_all(chunk, null);

        for (const sub_chunk of split_array_keep_delimiter(chunk, delimiter)) {
            collected.push(sub_chunk);

            if (sub_chunk.at(-1) === delimiter)
                lines += 1;
        }

        let remove = 0;

        while (lines > KEEP_LOG_LINES) {
            const remove_chunk = collected[remove];

            remove += 1;

            if (remove_chunk.at(-1) === delimiter)
                lines -= 1;
        }

        if (remove > 0)
            collected.splice(0, remove);
    }

    const decoder = new TextDecoder();

    return collected.map(v => decoder.decode(v)).join('');
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

        const pid = this._subprocess.get_identifier();

        this._get_logs = logging_to_journald
            ? collect_journald_logs.bind(globalThis, journalctl, start_date, pid)
            : collect_stdio_logs(this._subprocess.get_stdout_pipe()).catch(logError);

        if (!pid)
            return;

        GnomeDesktop.start_systemd_scope(
            this.journal_identifier,
            parseInt(pid, 10),
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
        const { wait_async, wait_finish } = this.g_subprocess;

        return promisify(wait_async, wait_finish).call(this.g_subprocess, cancellable);
    }

    wait_check(cancellable = null) {
        const { wait_check_async, wait_check_finish } = this.g_subprocess;

        return promisify(wait_check_async, wait_check_finish).call(this.g_subprocess, cancellable);
    }

    terminate() {
        this.g_subprocess.send_signal(SIGTERM);
    }

    get_logs() {
        if (this._get_logs instanceof Function)
            return this._get_logs();

        return this._get_logs;
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
