// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
// SPDX-FileContributor: Mohammad Javad Naderi
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Pango from 'gi://Pango';

import Gettext from 'gettext';

import { TerminalPage } from './terminalpage.js';
import { TerminalSettings } from './terminalsettings.js';

export const Notebook = GObject.registerClass({
    Properties: {
        'menus': GObject.ParamSpec.object(
            'menus',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gtk.Builder
        ),
        'terminal-settings': GObject.ParamSpec.object(
            'terminal-settings',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            TerminalSettings
        ),
        'current-child': GObject.ParamSpec.object(
            'current-child',
            null,
            null,
            GObject.ParamFlags.READABLE,
            Gtk.Widget
        ),
        'current-title': GObject.ParamSpec.string(
            'current-title',
            null,
            null,
            GObject.ParamFlags.READABLE,
            null
        ),
        'tab-expand': GObject.ParamSpec.boolean(
            'tab-expand',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            true
        ),
        'tab-policy': GObject.ParamSpec.string(
            'tab-policy',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            'always'
        ),
        'tab-show-shortcuts': GObject.ParamSpec.boolean(
            'tab-show-shortcuts',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            true
        ),
        'show-new-tab-button': GObject.ParamSpec.boolean(
            'show-new-tab-button',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            true
        ),
        'show-new-tab-front-button': GObject.ParamSpec.boolean(
            'show-new-tab-front-button',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            true
        ),
        'show-tab-switch-popup': GObject.ParamSpec.boolean(
            'show-tab-switch-popup',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            true
        ),
        'split-layout': GObject.ParamSpec.string(
            'split-layout',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            'no-split'
        ),
    },
    Signals: {
        'split-layout': {
            param_types: [TerminalPage, String],
        },
        'move-to-other-pane': {
            param_types: [TerminalPage],
        },
        'session-update': {},
    },
}, class DDTermNotebook extends Gtk.Notebook {
    _init(params) {
        super._init(params);

        const button_box = new Gtk.Box({ visible: true });

        this.new_tab_button = new Gtk.Button({
            image: Gtk.Image.new_from_icon_name('list-add', Gtk.IconSize.MENU),
            tooltip_text: Gettext.gettext('New Tab (Last)'),
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

        const menu = new Gio.Menu();
        menu.append_section(null, new NotebookMenu({ notebook: this }));
        menu.append_section(null, this.menus.get_object('notebook-layout'));

        this.tab_switch_button = new Gtk.MenuButton({
            menu_model: menu,
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
            tooltip_text: Gettext.gettext('New Tab (First)'),
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
                this.new_page().spawn();
            },
            'new-tab-front': () => {
                this.new_page(0).spawn();
            },
            'new-tab-before-current': () => {
                this.new_page(this.get_current_page()).spawn();
            },
            'new-tab-after-current': () => {
                this.new_page(this.get_current_page() + 1).spawn();
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

        const split_layout_action = new Gio.SimpleAction({
            name: 'split-layout',
            parameter_type: new GLib.VariantType('s'),
            state: GLib.Variant.new_string(this.split_layout),
        });
        this.connect('notify::split-layout', () => {
            split_layout_action.state = GLib.Variant.new_string(this.split_layout);
        });
        split_layout_action.connect('change-state', (_, value) => {
            this.emit('split-layout', this.current_child, value.unpack());
        });
        split_layout_action.set_state_hint(new GLib.Variant('as', [
            'no-split',
            'horizontal-split',
            'vertical-split',
        ]));
        this.actions.add_action(split_layout_action);

        this.connect('page-added', this.update_tabs_visible.bind(this));
        this.connect('page-removed', this.update_tabs_visible.bind(this));

        this.connect('notify::tab-policy', this.update_tabs_visible.bind(this));
        this.update_tabs_visible();

        this.connect('notify::tab-pos', this.update_tab_pos.bind(this));
        this.update_tab_pos();

        this.connect('notify::tab-expand', this.update_tab_expand.bind(this));
        this.update_tab_expand();

        this.connect('hierarchy-changed', this.update_root.bind(this));
        this.connect('notify::tab-show-shortcuts', this.update_tab_switch_accels.bind(this));
        this.update_root();

        this._current_child = null;

        this.connect('switch-page', (notebook, page) => {
            this._current_child = page;
            this.notify('current-child');
        });

        this.connect('notify::current-child', () => {
            const child = this.current_child;

            const title_handler = child?.connect('notify::terminal-title', () => {
                this.notify('current-title');
            });

            const destroy_handler = child?.connect('destroy', () => {
                child.disconnect(title_handler);
                child.disconnect(destroy_handler);
                this.disconnect(disconnect_handler);
            });

            const disconnect_handler = this.connect('notify::current-child', () => {
                child?.disconnect(title_handler);
                child?.disconnect(destroy_handler);
                this.disconnect(disconnect_handler);
            });

            this.notify('current-title');
        });

        const emit_session_update = () => this.emit('session-update');

        this.connect('page-added', emit_session_update);
        this.connect('page-removed', emit_session_update);
        this.connect('page-reordered', emit_session_update);

        this.page_disconnect = new Map();
    }

    on_page_added(child, page_num) {
        this.set_tab_reorderable(child, true);
        this.set_tab_detachable(child, true);
        this.child_set_property(child, 'tab-expand', this.tab_expand);

        const handlers = [
            child.connect('new-tab-before-request', () => {
                this.new_page(this.page_num(child)).spawn();
            }),
            child.connect('new-tab-after-request', () => {
                this.new_page(this.page_num(child) + 1).spawn();
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
            child.connect('split-layout-request', (_, param) => {
                this.emit('split-layout', child, param);
            }),
            child.connect('move-to-other-pane-request', () => {
                this.emit('move-to-other-pane', child);
            }),
            child.connect('session-update', () => {
                this.emit('session-update');
            }),
        ];

        const label = this.get_tab_label(child);

        const bindings = [
            this.bind_property_full(
                'tab-expand',
                label,
                'ellipsize',
                GObject.BindingFlags.SYNC_CREATE,
                (_, v) => [true, v ? Pango.EllipsizeMode.END : Pango.EllipsizeMode.NONE],
                null
            ),
            this.bind_property(
                'split-layout',
                child,
                'split-layout',
                GObject.BindingFlags.SYNC_CREATE
            ),
        ];

        this.page_disconnect.set(child, () => {
            while (handlers.length > 0)
                child.disconnect(handlers.pop());

            while (bindings.length > 0)
                bindings.pop().unbind();
        });

        this.update_tab_switch_accels();
        this.set_current_page(page_num);
        this.grab_focus();
    }

    on_page_removed(child, _page_num) {
        const disconnect = this.page_disconnect.get(child);
        this.page_disconnect.delete(child);

        if (disconnect)
            disconnect();

        this.update_tab_switch_accels();
    }

    on_page_reordered(_child, _page_num) {
        this.update_tab_switch_accels();
    }

    get_cwd() {
        return this.current_child?.get_cwd() ?? null;
    }

    new_page(position = -1, properties = {}) {
        const page = new TerminalPage({
            terminal_settings: this.terminal_settings,
            terminal_menu: this.menus.get_object('terminal-popup'),
            tab_menu: this.menus.get_object('tab-popup'),
            visible: true,
            ...properties,
            command: properties['command'] ?? this.get_command_from_settings(),
        });

        this.insert_page(page, page.tab_label, position);
        return page;
    }

    get_command_from_settings(working_directory = null, envv = null) {
        if (!working_directory && this.terminal_settings.preserve_working_directory)
            working_directory = this.get_cwd();

        return this.terminal_settings.get_command(working_directory, envv);
    }

    get_accel_for_page(i) {
        if (!this.tab_show_shortcuts)
            return '';

        const accels =
            this.get_toplevel().application?.get_accels_for_action(`notebook.switch-to-tab(${i})`);

        for (const accel of accels || []) {
            try {
                return Gtk.accelerator_get_label(...Gtk.accelerator_parse(accel));
            } catch (ex) {
                logError(ex);
            }
        }

        return '';
    }

    update_tab_switch_accels() {
        let i = 0;

        this.foreach(child => {
            child.switch_shortcut = this.get_accel_for_page(i++);
        });
    }

    update_root() {
        const root = this.get_toplevel();

        if (root === this._root)
            return;

        if (this._keys_handler) {
            this._root.disconnect(this._keys_handler);
            this._keys_handler = null;
        }

        this._root = root;

        if (root instanceof Gtk.Window) {
            this._keys_handler =
                root.connect('keys-changed', this.update_tab_switch_accels.bind(this));
        }

        this.update_tab_switch_accels();
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
        }
    }

    vfunc_grab_focus() {
        this.current_child?.grab_focus();
    }

    get current_child() {
        return this._current_child;
    }

    get current_title() {
        return this.current_child?.terminal_title ?? null;
    }

    serialize_state() {
        const properties = GLib.VariantDict.new(null);
        const variant_dict_type = new GLib.VariantType('a{sv}');
        const pages = [];

        for (const page of this.get_children()) {
            try {
                pages.push(page.serialize_state());
            } catch (ex) {
                logError(ex, "Can't serialize terminal state");
            }
        }

        properties.insert_value('pages', GLib.Variant.new_array(variant_dict_type, pages));
        properties.insert_value('current-page', GLib.Variant.new_int32(this.get_current_page()));
        return properties.end();
    }

    deserialize_state(variant) {
        const dict = GLib.VariantDict.new(variant);
        const pages = dict.lookup('pages', 'aa{sv}');

        if (!pages)
            return;

        for (const page_serialized of pages) {
            try {
                const page = TerminalPage.deserialize_state(page_serialized, {
                    terminal_settings: this.terminal_settings,
                    terminal_menu: this.menus.get_object('terminal-popup'),
                    tab_menu: this.menus.get_object('tab-popup'),
                    visible: true,
                });

                this.append_page(page, page.tab_label);

                if (!page.banner_visible)
                    page.spawn();
            } catch (ex) {
                logError(ex, "Can't restore terminal");
            }
        }

        const current_page = dict.lookup('current-page', 'i');

        if (current_page !== null)
            this.set_current_page(current_page);
    }
});

const NotebookMenu = GObject.registerClass({
    Properties: {
        'notebook': GObject.ParamSpec.object(
            'notebook',
            null,
            null,
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

        const page_handlers = new Map();

        const handlers = [
            this.notebook.connect('page-added', () => this._schedule_update()),
            this.notebook.connect('page-removed', () => this._schedule_update()),
            this.notebook.connect('page-reordered', () => this._schedule_update()),
            this.notebook.connect('page-added', (_, page) => {
                const handler =
                    page.connect('notify::terminal-title', () => this._schedule_update());

                page_handlers.set(page, handler);
            }),
            this.notebook.connect('page-removed', (_, page) => {
                page.disconnect(page_handlers.get(page));
                page_handlers.delete(page);
            }),
            this.notebook.connect('destroy', () => {
                while (handlers.length)
                    this.notebook.disconnect(handlers.pop());

                for (const [page, handler] of page_handlers.entries())
                    page.disconnect(handler);

                page_handlers.clear();
            }),
        ];
    }

    _update() {
        const prev_length = this.get_n_items();

        this._label = this.notebook.get_children().map(page => page.terminal_title);
        this._target.length = this._label.length;

        this.items_changed(0, prev_length, this._label.length);
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
