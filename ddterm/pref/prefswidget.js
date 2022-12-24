/*
    Copyright © 2020, 2021 Aleksandr Mezin

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

/* exported PrefsWidget */

const { GObject, Gtk } = imports.gi;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const { settings } = Me.imports.ddterm.common;

var PrefsWidget = GObject.registerClass(
    {
        Properties: {
            'settings': GObject.ParamSpec.object(
                'settings',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                settings.Settings
            ),
        },
    },
    class PrefsWidget extends Gtk.Box {
        _init(params) {
            super._init(params);

            this.hexpand = true;
            this.vexpand = true;
            this.visible = true;

            this.stack = new Gtk.Stack({
                visible: true,
                vhomogeneous: false,
                'transition-type': Gtk.StackTransitionType.SLIDE_UP_DOWN,
            });

            const stack_sidebar = new Gtk.StackSidebar({
                visible: true,
                stack: this.stack,
            });

            if (this.append)
                this.append(stack_sidebar);
            else
                this.pack_start(stack_sidebar, false, true, 0);

            const scrolled_window = new Gtk.ScrolledWindow({
                visible: true,
                'hscrollbar-policy': Gtk.PolicyType.NEVER,
                'propagate-natural-width': true,
                'propagate-natural-height': true,
            });

            const viewport = new Gtk.Viewport({
                visible: true,
            });

            if (viewport.set_child)
                viewport.set_child(this.stack);
            else
                viewport.add(this.stack);

            if (scrolled_window.set_child)
                scrolled_window.set_child(viewport);
            else
                scrolled_window.add(viewport);

            if (this.append)
                this.append(scrolled_window);
            else
                this.pack_end(scrolled_window, true, true, 0);

            const pages = {
                'position-size': Me.imports.ddterm.pref.prefspositionsize.Widget,
                'behavior': Me.imports.ddterm.pref.prefsbehavior.Widget,
                'animation': Me.imports.ddterm.pref.prefsanimation.Widget,
                'tabs': Me.imports.ddterm.pref.prefstabs.Widget,
                'text': Me.imports.ddterm.pref.prefstext.Widget,
                'colors': Me.imports.ddterm.pref.prefscolors.Widget,
                'command': Me.imports.ddterm.pref.prefscommand.Widget,
                'scrolling': Me.imports.ddterm.pref.prefsscrolling.Widget,
                'compatibility': Me.imports.ddterm.pref.prefscompatibility.Widget,
                'shortcuts': Me.imports.ddterm.pref.prefsshortcuts.Widget,
                'panel-icon': Me.imports.ddterm.pref.prefspanelicon.Widget,
            };

            for (const [name, type] of Object.entries(pages)) {
                const widget = new type({ settings: this.settings });
                this.stack.add_titled(widget, name, widget.title);
            }
        }
    }
);
