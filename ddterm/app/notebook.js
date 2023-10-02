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

/* exported Notebook */

const { GLib, GObject, Gio, Gtk, Pango } = imports.gi;
const { resources, terminalpage, terminalsettings } = imports.ddterm.app;
const { translations } = imports.ddterm.util;

var Notebook = GObject.registerClass({
    Properties: {
        'resources': GObject.ParamSpec.object(
            'resources',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            resources.Resources
        ),
        'terminal-settings': GObject.ParamSpec.object(
            'terminal-settings',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            terminalsettings.TerminalSettings
        ),
        'current-child': GObject.ParamSpec.object(
            'current-child',
            '',
            '',
            GObject.ParamFlags.READABLE,
            Gtk.Widget
        ),
        'current-title': GObject.ParamSpec.string(
            'current-title',
            '',
            '',
            GObject.ParamFlags.READABLE,
            null
        ),
        'tab-expand': GObject.ParamSpec.boolean(
            'tab-expand',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            true
        ),
        'tab-label-width': GObject.ParamSpec.int(
            'tab-label-width',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            -1,
            GLib.MAXINT32,
            -1
        ),
        'tab-policy': GObject.ParamSpec.string(
            'tab-policy',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            'always'
        ),
        'tab-close-buttons': GObject.ParamSpec.boolean(
            'tab-close-buttons',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            true
        ),
        'tab-show-shortcuts': GObject.ParamSpec.boolean(
            'tab-show-shortcuts',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            true
        ),
        'tab-label-ellipsize-mode': GObject.ParamSpec.enum(
            'tab-label-ellipsize-mode',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            Pango.EllipsizeMode,
            Pango.EllipsizeMode.NONE
        ),
        'show-new-tab-button': GObject.ParamSpec.boolean(
            'show-new-tab-button',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            true
        ),
        'show-new-tab-front-button': GObject.ParamSpec.boolean(
            'show-new-tab-front-button',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            true
        ),
        'show-tab-switch-popup': GObject.ParamSpec.boolean(
            'show-tab-switch-popup',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            true
        ),
    },
}, class DDTermNotebook extends Gtk.Notebook {
    _init(params) {
        super._init(params);

        const button_box = new Gtk.Box({ visible: true });

        this.new_tab_button = new Gtk.Button({
            image: Gtk.Image.new_from_icon_name('list-add', Gtk.IconSize.MENU),
            tooltip_text: translations.gettext('New Tab (Last)'),
            action_name: 'notebook.new-tab',
            relief: Gtk.ReliefStyle.NONE,
            visible: true,
        });
        button_box.add(this.new_tab_button);

        this.bind_property(
            'show-new-tab-button',
            this.new_tab_button,
            'visible',
            GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
        );

        this.tab_switch_button = new Gtk.MenuButton({
            menu_model: new NotebookMenu({ notebook: this }),
            focus_on_click: false,
            relief: Gtk.ReliefStyle.NONE,
            visible: true,
            use_popover: false,
        });
        button_box.add(this.tab_switch_button);

        this.bind_property(
            'show-tab-switch-popup',
            this.tab_switch_button,
            'visible',
            GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
        );

        this.set_action_widget(button_box, Gtk.PackType.END);

        this.new_tab_front_button = new Gtk.Button({
            image: Gtk.Image.new_from_icon_name('list-add', Gtk.IconSize.MENU),
            tooltip_text: translations.gettext('New Tab (First)'),
            action_name: 'notebook.new-tab-front',
            relief: Gtk.ReliefStyle.NONE,
            visible: true,
        });
        this.set_action_widget(this.new_tab_front_button, Gtk.PackType.START);

        this.bind_property(
            'show-new-tab-front-button',
            this.new_tab_front_button,
            'visible',
            GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
        );

        const actions = {
            'new-tab': () => {
                this.new_page();
            },
            'new-tab-front': () => {
                this.new_page(0);
            },
            'new-tab-before-current': () => {
                this.new_page(this.get_current_page());
            },
            'new-tab-after-current': () => {
                this.new_page(this.get_current_page() + 1);
            },
            'close-current-tab': () => {
                this.current_child?.destroy();
            },
            'next-tab': () => {
                const current = this.get_current_page();
                const n_pages = this.get_n_pages();

                this.set_current_page((current + 1) % n_pages);
            },
            'prev-tab': () => {
                const current = this.get_current_page();
                const n_pages = this.get_n_pages();

                this.set_current_page((n_pages + current - 1) % n_pages);
            },
        };

        this.actions = new Gio.SimpleActionGroup();
        this.insert_action_group('notebook', this.actions);

        for (const [name, activate] of Object.entries(actions)) {
            const action = new Gio.SimpleAction({ name });
            action.connect('activate', activate);
            this.actions.add_action(action);
        }

        this.tab_select_action = new Gio.PropertyAction({
            name: 'switch-to-tab',
            object: this,
            property_name: 'page',
        });
        this.actions.add_action(this.tab_select_action);

        this.connect('page-added', this.update_tabs_visible.bind(this));
        this.connect('page-removed', this.update_tabs_visible.bind(this));

        this.connect('notify::tab-policy', this.update_tabs_visible.bind(this));
        this.update_tabs_visible();

        this.connect('notify::tab-pos', this.update_tab_pos.bind(this));
        this.update_tab_pos();

        this.connect('notify::tab-expand', this.update_tab_expand.bind(this));
        this.update_tab_expand();

        this._current_child = null;

        this.connect('switch-page', (notebook, page) => {
            this._current_child = page;
            this.notify('current-child');
        });

        this.connect('notify::current-child', () => {
            const child = this.current_child;

            const title_handler = child?.connect('notify::title', () => {
                this.notify('current-title');
            });

            const disconnect_handler = this.connect('notify::current-child', () => {
                child.disconnect(title_handler);
                this.disconnect(disconnect_handler);
            });

            this.notify('current-title');
        });

        this.page_disconnect = new Map();
    }

    on_page_added(child, _page_num) {
        this.set_tab_reorderable(child, true);
        this.child_set_property(child, 'tab-expand', this.tab_expand);

        const handlers = [
            child.connect('new-tab-before-request', () => {
                this.new_page(this.page_num(child));
            }),
            child.connect('new-tab-after-request', () => {
                this.new_page(this.page_num(child) + 1);
            }),
            child.connect('move-prev-request', () => {
                const current = this.page_num(child);
                const n_pages = this.get_n_pages();

                this.reorder_child(child, (n_pages + current - 1) % n_pages);
            }),
            child.connect('move-next-request', () => {
                const current = this.page_num(child);
                const n_pages = this.get_n_pages();

                this.reorder_child(child, (current + 1) % n_pages);
            }),
        ];

        const label = this.get_tab_label(child);

        const bindings = [
            this.bind_property(
                'tab-label-width',
                label,
                'width-request',
                GObject.BindingFlags.SYNC_CREATE
            ),
            this.bind_property(
                'tab-label-ellipsize-mode',
                label,
                'ellipsize',
                GObject.BindingFlags.SYNC_CREATE
            ),
            this.bind_property(
                'tab-close-buttons',
                label,
                'close-button',
                GObject.BindingFlags.SYNC_CREATE
            ),
            this.bind_property(
                'tab-show-shortcuts',
                label,
                'show-shortcut',
                GObject.BindingFlags.SYNC_CREATE
            ),
        ];

        this.page_disconnect.set(child, () => {
            while (handlers.length > 0)
                child.disconnect(handlers.pop());

            while (bindings.length > 0)
                bindings.pop().unbind();
        });

        this.update_tab_switch_actions();
    }

    on_page_removed(child, _page_num) {
        const disconnect = this.page_disconnect.get(child);
        this.page_disconnect.delete(child);

        if (disconnect)
            disconnect();

        this.update_tab_switch_actions();
    }

    on_page_reordered(_child, _page_num) {
        this.update_tab_switch_actions();
    }

    get_cwd() {
        return this.current_child?.get_cwd() ?? null;
    }

    new_empty_page(position = -1, properties = {}) {
        const page = new terminalpage.TerminalPage({
            resources: this.resources,
            terminal_settings: this.terminal_settings,
            visible: true,
            ...properties,
        });

        const index = this.insert_page(page, page.tab_label, position);
        this.set_current_page(index);
        this.grab_focus();

        return page;
    }

    get_command_from_settings(working_directory = null, envv = null) {
        if (!working_directory && this.terminal_settings.preserve_working_directory)
            working_directory = this.get_cwd();

        return this.terminal_settings.get_command(working_directory, envv);
    }

    new_page(position = -1, command = null) {
        if (!command)
            command = this.get_command_from_settings();

        const page = this.new_empty_page(position);
        page.spawn(command);
        return page;
    }

    update_tab_switch_actions() {
        let i = 0;

        this.foreach(child => {
            const label = this.get_tab_label(child);

            label.action_target = GLib.Variant.new_int32(i++);
            label.action_name = 'notebook.switch-to-tab';
        });
    }

    update_tab_expand() {
        this.foreach(page => {
            this.child_set_property(page, 'tab-expand', this.tab_expand);
        });
    }

    update_tabs_visible() {
        switch (this.tab_policy) {
        case 'always':
            this.show_tabs = true;
            break;

        case 'never':
            this.show_tabs = false;
            break;

        case 'automatic':
            this.show_tabs = this.get_n_pages() > 1;
        }
    }

    update_tab_pos() {
        switch (this.tab_pos) {
        case Gtk.PositionType.TOP:
            this.tab_switch_button.direction = Gtk.ArrowType.DOWN;
            break;

        case Gtk.PositionType.BOTTOM:
            this.tab_switch_button.direction = Gtk.ArrowType.UP;
            break;

        case Gtk.PositionType.LEFT:
            this.tab_switch_button.direction = Gtk.ArrowType.RIGHT;
            break;

        case Gtk.PositionType.RIGHT:
            this.tab_switch_button.direction = Gtk.ArrowType.LEFT;
            break;
        }
    }

    vfunc_grab_focus() {
        this.current_child?.grab_focus();
    }

    get current_child() {
        return this._current_child;
    }

    get current_title() {
        return this.current_child?.title ?? null;
    }
});

function array_common_prefix(a, b) {
    let len = Math.min(a.length, b.length);
    let i = 0;

    while (i < len && a[i] === b[i])
        i++;

    return i;
}

function array_common_suffix(a, b) {
    return array_common_prefix(a.slice().reverse(), b.slice().reverse());
}

const NotebookMenu = GObject.registerClass({
    Properties: {
        'notebook': GObject.ParamSpec.object(
            'notebook',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Notebook
        ),
    },
}, class DDTermNotebookMenu extends Gio.MenuModel {
    _init(params) {
        super._init(params);

        this._label = [];
        this._action = GLib.Variant.new_string('notebook.switch-to-tab');
        this._target = [];
        this._update_source = null;

        this.notebook.connect('page-added', () => this._schedule_update());
        this.notebook.connect('page-removed', () => this._schedule_update());
        this.notebook.connect('page-reordered', () => this._schedule_update());

        const page_handlers = new Map();

        this.notebook.connect('page-added', (_, page) => {
            const handler = page.connect('notify::title', () => this._schedule_update());
            page_handlers.set(page, handler);
        });

        this.notebook.connect('page-removed', (_, page) => {
            page.disconnect(page_handlers.get(page));
            page_handlers.delete(page);
        });
    }

    _update() {
        const prev = this._label;
        const update = this.notebook.get_children().map(page => page.title);

        const common_prefix = array_common_prefix(prev, update);

        if (common_prefix === update.length && common_prefix === prev.length)
            return;

        const common = prev.length === update.length
            ? common_prefix + array_common_suffix(prev, update)
            : common_prefix;

        this._label = update;
        this._target.length = update.length;

        this.items_changed(common_prefix, prev.length - common, update.length - common);
    }

    _schedule_update() {
        if (this._update_source !== null) {
            GLib.Source.remove(this._update_source);
            this._update_source = null;
        }

        this._update_source = GLib.idle_add(GLib.PRIORITY_HIGH, () => {
            this._update_source = null;
            this._update();
            return GLib.SOURCE_REMOVE;
        });
    }

    vfunc_is_mutable() {
        return true;
    }

    vfunc_get_n_items() {
        return this._label.length;
    }

    vfunc_get_item_attributes(item_index) {
        let target = this._target[item_index];

        if (!target) {
            target = GLib.Variant.new_int32(item_index);
            this._target[item_index] = target;
        }

        return {
            [Gio.MENU_ATTRIBUTE_LABEL]: GLib.Variant.new_string(this._label[item_index]),
            [Gio.MENU_ATTRIBUTE_ACTION]: this._action,
            [Gio.MENU_ATTRIBUTE_TARGET]: target,
        };
    }

    vfunc_get_item_links(_) {
        return {};
    }
});
