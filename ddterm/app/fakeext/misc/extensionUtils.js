/*
    Copyright © 2024 Aleksandr Mezin

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

/*
    fake current extension object to make `Me.imports` and `Me.dir` work
    in application context
 */

let _extension = null;

function setCurrentExtension(extension) {
    _extension = extension;
}

/* exported setCurrentExtension */

function getCurrentExtension() {
    return _extension;
}

/* exported getCurrentExtension */

// copied from real extensionUtils
function installImporter(extension) {
    let oldSearchPath = imports.searchPath.slice();  // make a copy
    imports.searchPath = [extension.dir.get_parent().get_path()];
    // importing a "subdir" creates a new importer object that doesn't affect
    // the global one
    extension.imports = imports[extension.dir.get_basename()];
    imports.searchPath = oldSearchPath;
}

/* exported installImporter */
