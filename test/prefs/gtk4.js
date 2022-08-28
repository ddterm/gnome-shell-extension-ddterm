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

imports.gi.versions.Gdk = '4.0';
imports.gi.versions.Gtk = '4.0';

const System = imports.system;
const { Gio } = imports.gi;

const TEST_PREFS_DIR = Gio.File.new_for_commandline_arg(System.programInvocationName).get_parent();
const APP_DATA_DIR = TEST_PREFS_DIR.get_parent().get_parent();

imports.searchPath.unshift(APP_DATA_DIR.get_path());

const Me = imports.misc.extensionUtils.getCurrentExtension();

Me.dir = APP_DATA_DIR;

const app = new Me.imports.test.prefs.common.Application();
app.run([System.programInvocationName].concat(ARGV));
