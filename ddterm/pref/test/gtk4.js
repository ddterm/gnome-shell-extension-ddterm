#!/usr/bin/env -S gjs -m

// SPDX-FileCopyrightText: 2021 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import 'gi://Gdk?version=4.0';
import 'gi://Gtk?version=4.0';

import GObject from 'gi://GObject';
import Adw from 'gi://Adw?version=1';

import System from 'system';

import { Application } from './common.js';

const AdwApplication = GObject.registerClass({
}, class AdwApplication extends Application {
    startup() {
        Adw.init();

        return super.startup();
    }
});

const app = new AdwApplication();
app.runAsync([System.programInvocationName].concat(ARGV));
