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
import Gio from 'gi://Gio';

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
function sd_journal_stream_fd(identifier, priority = LOG_INFO, level_prefix = false) {
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
        GLib.unix_set_fd_nonblocking(fd, false);
        return fd;
    } catch (ex) {
        GLib.close(fd);
        throw ex;
    }
}

export { sd_journal_stream_fd };
