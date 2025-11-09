#!/usr/bin/env -S gjs -m

// SPDX-FileCopyrightText: 2021 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import 'gi://Gdk?version=3.0';
import 'gi://Gtk?version=3.0';

import GObject from 'gi://GObject';
import Handy from 'gi://Handy?version=1';

import System from 'system';

import { Application } from './common.js';

const HdyApplication = GObject.registerClass({
}, class HdyApplication extends Application {
    startup() {
        Handy.init();

        return super.startup();
    }
});

const app = new HdyApplication();
app.runAsync([System.programInvocationName].concat(ARGV));
