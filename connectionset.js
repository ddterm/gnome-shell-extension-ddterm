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

var ConnectionSet = class ConnectionSet {
    constructor() {
        this.connections = new Map();
    }

    add(object, handler_id) {
        if (!this.connections.has(object))
            this.connections.set(object, new Set());

        this.connections.get(object).add(handler_id);
        return handler_id;
    }

    connect(object, signal, callback) {
        return this.add(object, object.connect(signal, callback));
    }

    disconnect(match_object = null, match_handler_id = null) {
        if (match_object === null) {
            if (match_handler_id !== null)
                throw new Error('match_handler_id should be null if match_object is null');

            this.connections.forEach((object_handlers, object) => {
                object_handlers.forEach(handler_id => {
                    object.disconnect(handler_id);
                });
            });

            this.connections.clear();
            return;
        }

        const object_handlers = this.connections.get(match_object);

        if (object_handlers === null) {
            printerr(`No handlers for object=${match_object} found in group ${this}`);
            return;
        }

        if (match_handler_id === null) {
            this.connections.delete(match_object);

            object_handlers.forEach(handler_id => {
                match_object.disconnect(handler_id);
            });

            return;
        }

        if (object_handlers.delete(match_handler_id)) {
            match_object.disconnect(match_handler_id);
        } else {
            printerr(
                `No handler with id=${match_handler_id} found` +
                ` for object=${match_object} in group ${this}`
            );
        }
    }
};
