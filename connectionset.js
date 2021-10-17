/*
    Copyright © 2021 Aleksandr Mezin

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

/* exported ConnectionSet */

class ConnectionSet {
    constructor() {
        this.connections = [];
    }

    add(object, handler_id) {
        this.connections.push({ object, handler_id });
        return handler_id;
    }

    connect(object, signal, callback) {
        return this.add(object, object.connect(signal, callback));
    }

    disconnect(object = null, handler_id = null) {
        if (handler_id) {
            this.connections = this.connections.filter(
                c => c.handler_id !== handler_id || c.object !== object
            );
            try {
                object.disconnect(handler_id);
            } catch (ex) {
                logError(ex, `Can't disconnect handler ${handler_id} on object ${object}`);
            }
            return;
        }

        while (this.connections.length) {
            const c = this.connections.pop();
            try {
                c.object.disconnect(c.handler_id);
            } catch (ex) {
                logError(ex, `Can't disconnect handler ${c.handler_id} on object ${c.object}`);
            }
        }
    }
}
