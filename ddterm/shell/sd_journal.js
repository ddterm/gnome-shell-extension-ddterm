// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
// SPDX-FileContributor: Vicente Maroto Garzón
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import Gi from 'gi';

function try_require(namespace, version = undefined) {
    try {
        return Gi.require(namespace, version);
    } catch (ex) {
        logError(ex);
        return null;
    }
}

const GLibUnix = GLib.check_version(2, 79, 2) === null ? try_require('GLibUnix') : null;
const set_fd_nonblocking = GLibUnix?.set_fd_nonblocking ?? GLib.unix_set_fd_nonblocking;

/* We only care about Linux here, because otherwise it won't be systemd */
const SOL_SOCKET = 1;
const SO_SNDBUF = 7;

const LARGE_BUFFER_SIZE = 8 * 1024 * 1024;

const LOG_INFO = 6;

function dup(fd) {
    const duper = Gio.UnixFDList.new();
    duper.append(fd);
    return duper.steal_fds()[0];
}

/* like gio-launch-desktop */
export function sd_journal_stream_fd(identifier, priority = LOG_INFO, level_prefix = false) {
    if (priority < 0)
        priority = 0;

    if (priority > 7)
        priority = 7;

    const header = [
        identifier || '',
        '', /* empty unit ID */
        `${priority}`,
        `${Number(Boolean(level_prefix))}`,
        '0', /* don't forward to syslog */
        '0', /* don't forward to kmsg */
        '0', /* don't forward to console */
        '', /* add newline in the end */
    ].join('\n');

    const addr = Gio.UnixSocketAddress.new('/run/systemd/journal/stdout');

    const socket = Gio.Socket.new(
        Gio.SocketFamily.UNIX,
        Gio.SocketType.STREAM,
        Gio.SocketProtocol.DEFAULT
    );

    let fd;

    try {
        socket.connect(addr, null);
        socket.shutdown(true, false);
        socket.set_option(SOL_SOCKET, SO_SNDBUF, LARGE_BUFFER_SIZE);
        socket.send(header, null);

        fd = dup(socket.fd);
    } finally {
        socket.close();
    }

    try {
        set_fd_nonblocking(fd, true);
        return fd;
    } catch (ex) {
        GLib.close(fd);
        throw ex;
    }
}
