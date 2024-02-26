// SPDX-FileCopyrightText: © 2023 Aleksandr Mezin
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import System from 'system';

import { get_resource_text } from './resources.js';

export class HeapDumper {
    constructor() {
        this.dbus = Gio.DBusExportedObject.wrapJSObject(
            get_resource_text('../com.github.amezin.ddterm.HeapDump.xml'),
            this
        );
    }

    GC() {
        System.gc();
    }

    Dump(path) {
        if (!path) {
            path = GLib.build_filenamev([
                GLib.get_user_state_dir(),
                this.application_id,
            ]);
            GLib.mkdir_with_parents(path, 0o700);
        }

        if (GLib.file_test(path, GLib.FileTest.IS_DIR)) {
            path = GLib.build_filenamev([
                path,
                `${this.application_id}-${new Date().toISOString().replace(/:/g, '-')}.heap`,
            ]);
        }

        printerr(`Dumping heap to ${path}`);
        System.dumpHeap(path);
        printerr(`Dumped heap to ${path}`);

        return path;
    }
}
