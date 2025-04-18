#!/usr/bin/env -S gjs -m

// SPDX-FileCopyrightText: 2021 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import 'gi://Gdk?version=3.0';
import 'gi://Gtk?version=3.0';

import System from 'system';

import { Application } from './common.js';

const app = new Application();
app.run([System.programInvocationName].concat(ARGV));
