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

const { GObject, Gio } = imports.gi;

var Action = GObject.registerClass(
    class DDTermSimpleAction extends Gio.SimpleAction {
        _init(params) {
            this.activate_callback = params.activate;
            delete params.activate;
            super._init(params);
        }

        on_activate(...args) {
            this.activate_callback(...args);
        }
    }
);

function group(mapping) {
    const result = Gio.SimpleActionGroup.new();

    Object.entries(mapping).forEach(([name, activate]) => {
        result.add_action(new Action({ name, activate }));
    });

    return result;
}

/* exported Action group */
