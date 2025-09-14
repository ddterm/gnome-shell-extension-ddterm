// SPDX-FileCopyrightText: 2020 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { AnimationWidget } from './animation.js';
import { BehaviorWidget } from './behavior.js';
import { ColorsWidget } from './colors.js';
import { CommandWidget } from './command.js';
import { CompatibilityWidget } from './compatibility.js';
import { PanelIconWidget } from './panelicon.js';
import { PositionSizeWidget } from './positionsize.js';
import { ScrollingWidget } from './scrolling.js';
import { ShortcutsWidget } from './shortcuts.js';
import { TabsWidget } from './tabs.js';
import { TextWidget } from './text.js';

export const PrefsWidget = GObject.registerClass({
    Properties: {
        'settings': GObject.ParamSpec.object(
            'settings',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.Settings
        ),
        'monitors': GObject.ParamSpec.object(
            'monitors',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            Gio.ListModel
        ),
        'gettext-domain': GObject.ParamSpec.jsobject(
            'gettext-domain',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY
        ),
    },
}, class PrefsWidget extends Gtk.Box {
    constructor(params) {
        super(params);

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

        this.#add_page('position-size', PositionSizeWidget, { monitors: this.monitors });
        this.#add_page('behavior', BehaviorWidget);
        this.#add_page('animation', AnimationWidget);
        this.#add_page('tabs', TabsWidget);
        this.#add_page('text', TextWidget);
        this.#add_page('colors', ColorsWidget);
        this.#add_page('command', CommandWidget);
        this.#add_page('scrolling', ScrollingWidget);
        this.#add_page('compatibility', CompatibilityWidget);
        this.#add_page('shortcuts', ShortcutsWidget);
        this.#add_page('panel-icon', PanelIconWidget);
    }

    #add_page(name, widget_type, extra_properties = {}) {
        const widget = new widget_type({
            settings: this.settings,
            gettext_domain: this.gettext_domain,
            ...extra_properties,
        });

        this.stack.add_titled(widget, name, widget.title);

        return widget;
    }
});
