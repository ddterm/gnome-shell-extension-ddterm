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

const { GObject, Gio, Gtk } = imports.gi;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const { backport } = Me.imports.ddterm;

var PrefsWidget = backport.GObject.registerClass(
    {
        Properties: {
            'settings': GObject.ParamSpec.object(
                'settings',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                Gio.Settings
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
                'position-size': Me.imports.ddterm.pref.positionsize.Widget,
                'behavior': Me.imports.ddterm.pref.behavior.Widget,
                'animation': Me.imports.ddterm.pref.animation.Widget,
                'tabs': Me.imports.ddterm.pref.tabs.Widget,
                'text': Me.imports.ddterm.pref.text.Widget,
                'colors': Me.imports.ddterm.pref.colors.Widget,
                'command': Me.imports.ddterm.pref.command.Widget,
                'scrolling': Me.imports.ddterm.pref.scrolling.Widget,
                'compatibility': Me.imports.ddterm.pref.compatibility.Widget,
                'shortcuts': Me.imports.ddterm.pref.shortcuts.Widget,
                'panel-icon': Me.imports.ddterm.pref.panelicon.Widget,
            };

            for (const [name, type] of Object.entries(pages)) {
                const widget = new type({ settings: this.settings });
                this.stack.add_titled(widget, name, widget.title);
            }
        }
    }
);
