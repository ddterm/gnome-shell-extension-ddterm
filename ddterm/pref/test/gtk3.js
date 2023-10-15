#!/usr/bin/env gjs

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

imports.gi.versions.Gdk = '3.0';
imports.gi.versions.Gtk = '3.0';

const System = imports.system;
const { Gio } = imports.gi;

const PREF_TEST_DIR = Gio.File.new_for_path(System.programPath).get_parent();
const ME_DIR = PREF_TEST_DIR.get_parent().get_parent().get_parent();

imports.searchPath.unshift(ME_DIR.get_path());
Object.assign(imports.misc.extensionUtils.getCurrentExtension(), { imports, dir: ME_DIR });

const app = new imports.ddterm.pref.test.common.Application({ install_dir: ME_DIR });
app.run([System.programInvocationName].concat(ARGV));
