// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

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

// SPDX-SnippetBegin
// SDPX-SnippetName: installImporter() function from GNOME Shell 40 js/misc/extensionUtils.js
// SPDX-SnippetCopyrightText: 2016 Philip Chimento
// SPDX-SnippetCopyrightText: 2016 Florian Müllner

function installImporter(extension) {
    let oldSearchPath = imports.searchPath.slice();  // make a copy
    imports.searchPath = [extension.dir.get_parent().get_path()];
    // importing a "subdir" creates a new importer object that doesn't affect
    // the global one
    extension.imports = imports[extension.dir.get_basename()];
    imports.searchPath = oldSearchPath;
}

// SPDX-SnippetEnd

/* exported installImporter */
