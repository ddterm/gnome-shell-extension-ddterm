// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
// SPDX-FileContributor: Mohammad Javad Naderi
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Handy from 'gi://Handy';

import { TerminalPage } from './terminalpage.js';
import { TerminalSettings } from './terminalsettings.js';

const ACTIONS = [
    'new_tab_action',
    'new_tab_front_action',
    'new_tab_before_current_action',
    'new_tab_after_current_action',
    'next_tab_action',
    'prev_tab_action',
    'switch_to_tab_action',
];

function converter(func) {
    return (binding, value) => {
        try {
            return [true, func(value)];
        } catch (error) {
            logError(error);

            return [false, null];
        }
    };
}

function mapping_lookup(map_object, key) {
    const value = map_object[key];

    if (value === undefined)
        throw new Error(`Unknown key ${key}`);

    return value;
}

export class Notebook extends Gtk.Box {
    static [GObject.GTypeName] = 'DDTermNotebook';

    static [Gtk.template] =
        GLib.Uri.resolve_relative(import.meta.url, './ui/notebook.ui', GLib.UriFlags.NONE);

    static [Gtk.children] = [
        'view',
    ];

    static [Gtk.internalChildren] = [
        'bar',
        'layout_menu',
        'tab_switch_button',
        ...ACTIONS,
    ];

    static [GObject.properties] = {
        'terminal-settings': GObject.ParamSpec.object(
            'terminal-settings',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            TerminalSettings
        ),
        'current-child': GObject.ParamSpec.object(
            'current-child',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            Gtk.Widget
        ),
        'current-title': GObject.ParamSpec.string(
            'current-title',
            null,
            null,
            GObject.ParamFlags.READABLE,
            null
        ),
        'current-page': GObject.ParamSpec.int(
            'current-page',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            -1,
            GLib.MAXINT32,
            -1
        ),
        'n-pages': GObject.ParamSpec.int(
            'n-pages',
            null,
            null,
            GObject.ParamFlags.READABLE,
            0,
            GLib.MAXINT32,
            0
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
        'tab-pos': GObject.ParamSpec.enum(
            'tab-pos',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            Gtk.PositionType,
            Gtk.PositionType.BOTTOM
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
    };

    static [GObject.signals] = {
        'split-layout': {
            param_types: [TerminalPage, String],
        },
        'move-to-other-pane': {
            param_types: [TerminalPage],
        },
        'session-update': {},
    };

    static {
        GObject.type_ensure(Gio.PropertyAction);

        GObject.registerClass(this);
    }

    #page_disconnect;

    constructor(params) {
        super(params);

        // Disable built-in shortcuts
        GObject.signal_handlers_disconnect_matched(this.view, {
            signalId: 'key-press-event',
        });

        const menu = new Gio.Menu();
        menu.append_section(null, new NotebookMenu({ tab_view: this.view }));
        menu.append_section(null, this._layout_menu);

        this._tab_switch_button.menu_model = menu;

        this.bind_property_full(
            'tab-policy',
            this._bar,
            'autohide',
            GObject.BindingFlags.SYNC_CREATE,
            converter(mapping_lookup.bind(globalThis, {
                'automatic': true,
                'always': false,
                'never': false,
            })),
            null
        );

        this.bind_property_full(
            'tab-policy',
            this._bar,
            'visible',
            GObject.BindingFlags.SYNC_CREATE,
            converter(mapping_lookup.bind(globalThis, {
                'automatic': true,
                'always': true,
                'never': false,
            })),
            null
        );

        this.connect('notify::tab-pos', this.#update_tab_pos.bind(this));
        this.#update_tab_pos();

        const actions = new Gio.SimpleActionGroup();

        for (const name of ACTIONS)
            actions.add_action(this[`_${name}`]);

        const split_layout_action = new Gio.SimpleAction({
            name: 'split-layout',
            parameter_type: new GLib.VariantType('s'),
            state: GLib.Variant.new_string(this.split_layout),
        });
        this.bind_property_full(
            'split-layout',
            split_layout_action,
            'state',
            GObject.BindingFlags.DEFAULT,
            converter(GLib.Variant.new_string),
            null
        );
        split_layout_action.connect('change-state', (_, value) => {
            this.emit('split-layout', this.current_child, value.unpack());
        });
        split_layout_action.set_state_hint(new GLib.Variant('as', [
            'no-split',
            'horizontal-split',
            'vertical-split',
        ]));
        actions.add_action(split_layout_action);

        this.insert_action_group('notebook', actions);

        this.connect('hierarchy-changed', this.#update_root.bind(this));
        this.connect('notify::tab-show-shortcuts', this.#update_tab_switch_accels.bind(this));
        this.connect('notify::current-page', this.#update_tab_switch_accels.bind(this));
        this.#update_root();

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

        this.#page_disconnect = new Map();
    }

    bind_settings(settings) {
        settings.bind('new-tab-button',
            this,
            'show-new-tab-button',
            Gio.SettingsBindFlags.GET
        );

        settings.bind(
            'new-tab-front-button',
            this,
            'show-new-tab-front-button',
            Gio.SettingsBindFlags.GET
        );

        settings.bind(
            'tab-switcher-popup',
            this,
            'show-tab-switch-popup',
            Gio.SettingsBindFlags.GET
        );

        settings.bind(
            'tab-policy',
            this,
            'tab-policy',
            Gio.SettingsBindFlags.GET
        );

        settings.bind(
            'tab-position',
            this,
            'tab-pos',
            Gio.SettingsBindFlags.GET
        );

        settings.bind(
            'tab-expand',
            this,
            'tab-expand',
            Gio.SettingsBindFlags.GET
        );
    }

    _new_tab_action_activate() {
        this.new_page().spawn();
    }

    _new_tab_front_action_activate() {
        this.new_page(0).spawn();
    }

    _new_tab_before_current_action_activate() {
        const current_page = this.view.get_selected_page();
        const position =
            current_page ? this.view.get_page_position(current_page) : 0;

        this.new_page(position).spawn();
    }

    _new_tab_after_current_action_activate() {
        const current_page = this.view.get_selected_page();
        const position =
            current_page ? this.view.get_page_position(current_page) + 1 : 0;

        this.new_page(position).spawn();
    }

    _next_tab_action_activate() {
        this.view.select_next_page();
    }

    _prev_tab_action_activate() {
        this.view.select_previous_page();
    }

    _page_attached(view, page, _position) {
        const { child } = page;

        const handlers = [
            child.connect('new-tab-before-request', () => {
                this.new_page(this.view.get_page_position(page)).spawn();
            }),
            child.connect('new-tab-after-request', () => {
                this.new_page(this.view.get_page_position(page) + 1).spawn();
            }),
            child.connect('move-prev-request', () => {
                this.view.reorder_backward(page);
            }),
            child.connect('move-next-request', () => {
                this.view.reorder_forward(page);
            }),
            child.connect('split-layout-request', (_, param) => {
                this.emit('split-layout', child, param);
            }),
            child.connect('move-to-other-pane-request', () => {
                this.emit('move-to-other-pane', child);
            }),
            child.connect('close-request', () => {
                this.view.close_page(page);
            }),
            child.connect('close-finish', (_, confirm) => {
                this.view.close_page_finish(page, confirm);

                if (confirm)
                    child.destroy();
            }),
            child.connect('session-update', () => {
                this.emit('session-update');
            }),
        ];

        const bindings = [
            this.bind_property(
                'split-layout',
                child,
                'split-layout',
                GObject.BindingFlags.SYNC_CREATE
            ),
        ];

        this.#page_disconnect.set(child, () => {
            while (handlers.length > 0)
                child.disconnect(handlers.pop());

            while (bindings.length > 0)
                bindings.pop().unbind();
        });

        this.view.selected_page = page;
        this.grab_focus();
        this.#update_tab_switch_accels();
        this.emit('session-update');
    }

    _page_detached(view, page, _position) {
        const { child } = page;

        const disconnect = this.#page_disconnect.get(child);
        this.#page_disconnect.delete(child);

        if (disconnect)
            disconnect();

        this.#update_tab_switch_accels();
        this.emit('session-update');
    }

    _page_reordered(view, page, _position) {
        if (page.selected)
            this.notify('current-page');

        this.#update_tab_switch_accels();
        this.emit('session-update');
    }

    _notify_n_pages() {
        this.notify('n-pages');
    }

    _notify_selected_page() {
        this.notify('current-page');
        this.notify('current-child');
    }

    _close_page(_view, page) {
        page.child.close();

        return true;
    }

    _setup_menu(_view, page) {
        this._bar.insert_action_group('page', page?.child.get_action_group('page') ?? null);
    }

    get_cwd() {
        return this.current_child?.get_cwd() ?? null;
    }

    get n_pages() {
        return this.view.get_n_pages();
    }

    new_page(position = -1, properties = {}) {
        const child = new TerminalPage({
            terminal_settings: this.terminal_settings,
            visible: true,
            ...properties,
            command: properties['command'] ?? this.get_command_from_settings(),
        });

        const page = position === -1 ? this.view.append(child) : this.view.insert(child, position);

        this.#bind_page(page);

        return child;
    }

    #bind_page(page) {
        page.child.bind_property('title', page, 'title', GObject.BindingFlags.SYNC_CREATE);
    }

    get_command_from_settings(working_directory = null, envv = null) {
        if (!working_directory && this.terminal_settings.preserve_working_directory)
            working_directory = this.get_cwd();

        return this.terminal_settings.get_command(working_directory, envv);
    }

    #get_accel_for_page(i) {
        if (!this.tab_show_shortcuts)
            return '';

        const accels =
            this.get_toplevel().application?.get_accels_for_action(`notebook.switch-to-tab(${i})`);

        for (const accel of accels || []) {
            try {
                const [key, mods] = Gtk.accelerator_parse(accel);

                if (!key && !mods)
                    continue;

                const label = Gtk.accelerator_get_label(key, mods);

                if (label)
                    return label;
            } catch (ex) {
                logError(ex);
            }
        }

        return '';
    }

    #update_tab_switch_accels() {
        const n = this.view.get_n_pages();
        const current = this.current_page;

        for (let i = 0; i < n; i++) {
            const { child } = this.view.get_nth_page(i);

            if (i === current)
                child.switch_shortcut = null;
            else
                child.switch_shortcut = this.#get_accel_for_page(i);
        }
    }

    #update_root() {
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
                root.connect('keys-changed', this.#update_tab_switch_accels.bind(this));
        }

        this.#update_tab_switch_accels();
    }

    #update_tab_pos() {
        switch (this.tab_pos) {
        case Gtk.PositionType.BOTTOM:
            this.reorder_child(this._bar, -1);
            this._tab_switch_button.direction = Gtk.ArrowType.UP;
            break;

        case Gtk.PositionType.TOP:
            this.reorder_child(this._bar, 0);
            this._tab_switch_button.direction = Gtk.ArrowType.DOWN;
            break;

        default:
            logError(new Error(`Unsupported tab-pos: ${this.tab_pos}`));
        }
    }

    vfunc_grab_focus() {
        this.current_child?.grab_focus();
    }

    get current_child() {
        return this.view.selected_page?.child ?? null;
    }

    set current_child(child) {
        this.view.selected_page = child ? this.view.get_page(child) : null;
    }

    get current_page() {
        const { selected_page } = this.view;

        return selected_page ? this.view.get_page_position(selected_page) : -1;
    }

    set current_page(position) {
        this.view.selected_page = position === -1 ? null : this.view.get_nth_page(position);
    }

    get current_title() {
        return this.current_child?.terminal_title ?? null;
    }

    transfer_page(child, notebook) {
        const page = this.view.get_page(child);

        this.view.transfer_page(page, notebook.view, notebook.view.get_n_pages());
    }

    transfer_all_pages(notebook) {
        while (this.view.get_n_pages() > 0) {
            this.view.transfer_page(
                this.view.get_nth_page(0),
                notebook.view,
                notebook.view.get_n_pages()
            );
        }
    }

    serialize_state() {
        const properties = GLib.VariantDict.new(null);
        const variant_dict_type = new GLib.VariantType('a{sv}');
        const pages = [];
        const n = this.view.get_n_pages();

        for (let i = 0; i < n; i++) {
            const page = this.view.get_nth_page(i);

            try {
                pages.push(page.child.serialize_state());
            } catch (ex) {
                logError(ex, "Can't serialize terminal state");
            }
        }

        properties.insert_value('pages', GLib.Variant.new_array(variant_dict_type, pages));

        const current_page = this.view.get_selected_page();

        if (current_page) {
            const position = this.view.get_page_position(current_page);

            properties.insert_value('current-page', GLib.Variant.new_int32(position));
        }

        return properties.end();
    }

    deserialize_state(variant) {
        const dict = GLib.VariantDict.new(variant);
        const pages = dict.lookup('pages', 'aa{sv}');

        if (!pages)
            return;

        for (const page_serialized of pages) {
            try {
                const child = TerminalPage.deserialize_state(page_serialized, {
                    terminal_settings: this.terminal_settings,
                    visible: true,
                });

                const page = this.view.append(child);

                this.#bind_page(page);

                if (!child.banner_visible)
                    child.spawn();
            } catch (ex) {
                logError(ex, "Can't restore terminal");
            }
        }

        const current_page = dict.lookup('current-page', 'i');

        if (current_page !== null && current_page >= 0 && current_page < this.n_pages)
            this.view.set_selected_page(this.view.get_nth_page(current_page));
    }
}

class NotebookMenu extends Gio.MenuModel {
    static [GObject.GTypeName] = 'DDTermNotebookMenu';

    static [GObject.properties] = {
        'tab-view': GObject.ParamSpec.object(
            'tab-view',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Handy.TabView
        ),
    };

    static {
        GObject.registerClass(this);
    }

    #label;
    #action;
    #target;
    #update_source = null;

    constructor(params) {
        super(params);

        this.#label = [];
        this.#action = GLib.Variant.new_string('notebook.switch-to-tab');
        this.#target = [];

        const child_handlers = new Map();
        const schedule_update = this.#schedule_update.bind(this);
        const handlers = [
            this.tab_view.connect('page-attached', schedule_update),
            this.tab_view.connect('page-detached', schedule_update),
            this.tab_view.connect('page-reordered', schedule_update),
            this.tab_view.connect('page-attached', (_, page) => {
                const handler = page.child.connect('notify::terminal-title', schedule_update);

                child_handlers.set(page, handler);
            }),
            this.tab_view.connect('page-detached', (_, page) => {
                page.child.disconnect(child_handlers.get(page));
                child_handlers.delete(page);
            }),
            this.tab_view.connect('destroy', () => {
                while (handlers.length)
                    this.tab_view.disconnect(handlers.pop());

                for (const [page, handler] of child_handlers.entries())
                    page.child.disconnect(handler);

                child_handlers.clear();

                if (this.#update_source !== null) {
                    GLib.Source.remove(this.#update_source);
                    this.#update_source = null;
                }
            }),
        ];
    }

    #update() {
        const prev_length = this.get_n_items();
        const n = this.tab_view.get_n_pages();

        this.#label = [];

        for (let i = 0; i < n; i++) {
            const page = this.tab_view.get_nth_page(i);

            this.#label.push(page.child.terminal_title);
        }

        this.#target.length = this.#label.length;

        this.items_changed(0, prev_length, this.#label.length);
    }

    #schedule_update() {
        if (this.#update_source) {
            GLib.Source.remove(this.#update_source);
            this.#update_source = null;
        }

        this.#update_source = GLib.idle_add(GLib.PRIORITY_HIGH, () => {
            this.#update_source = null;
            this.#update();
            return GLib.SOURCE_REMOVE;
        });
    }

    vfunc_is_mutable() {
        return true;
    }

    vfunc_get_n_items() {
        return this.#label.length;
    }

    vfunc_get_item_attributes(item_index) {
        let target = this.#target[item_index];

        if (!target) {
            target = GLib.Variant.new_int32(item_index);
            this.#target[item_index] = target;
        }

        return {
            [Gio.MENU_ATTRIBUTE_LABEL]: GLib.Variant.new_string(this.#label[item_index]),
            [Gio.MENU_ATTRIBUTE_ACTION]: this.#action,
            [Gio.MENU_ATTRIBUTE_TARGET]: target,
        };
    }

    vfunc_get_item_links(_) {
        return {};
    }
}
