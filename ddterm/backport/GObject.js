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

const { GObject } = imports.gi;

const Me = imports.misc.extensionUtils.getCurrentExtension();

const { _checkAccessors } = Me.imports.ddterm.backport._common;

function _resolveLegacyClassFunction(klass, func) {
    // Find the "least derived" class with a _classInit static function; there
    // definitely is one, since this class must inherit from GObject
    let initclass = klass;
    while (typeof initclass[func] === 'undefined')
        initclass = Object.getPrototypeOf(initclass.prototype).constructor;
    return initclass[func];
}

function _findClassInit(klass) {
    if ('_classInit' in klass) {
        return klass._classInit;
    } else {
        // Lang.Class compatibility.
        return _resolveLegacyClassFunction(klass, '_classInit');
    }
}

function _checkProperties(klass) {
    if (!klass.hasOwnProperty(GObject.properties))
        return;

    for (let pspec of Object.values(klass[GObject.properties]))
        _checkAccessors(klass.prototype, pspec, GObject);
}

function _classInit(chain, klass) {
    _checkProperties(klass);

    // eslint-disable-next-line no-invalid-this
    return chain.call(this, klass);
}

function _registerClass(...args) {
    const klass = args[args.length - 1];

    klass._classInit = _classInit.bind(klass, _findClassInit(klass));

    return GObject.registerClass(...args);
}

var registerClass = imports.system.version >= 16502 ? GObject.registerClass : _registerClass;

/* exported registerClass */
