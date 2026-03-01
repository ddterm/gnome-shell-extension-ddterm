// SPDX-FileCopyrightText: 2020 Aleksandr Mezin <mezin.alexander@gmail.com>
// SPDX-FileContributor: Juan M. Cruz-Martinez
// SPDX-FileContributor: Jackson Goode
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';

import { TerminalSettings } from './terminalsettings.js';
import { Notebook } from './notebook.js';
import { DisplayConfig, LayoutMode } from '../util/displayconfig.js';

function set_widget_cursor(cursor, widget) {
    widget.window.cursor = cursor;
}

export const AppWindow = GObject.registerClass({
    Template: GLib.Uri.resolve_relative(import.meta.url, './ui/appwindow.ui', GLib.UriFlags.NONE),
    Children: [
        'paned',
        'notebook1',
        'notebook2',
    ],
    InternalChildren: [
        'resize_box_north',
        'resize_box_south',
        'resize_box_east',
        'resize_box_west',
    ],
    Properties: {
        'hide-on-close': GObject.ParamSpec.boolean(
            'hide-on-close',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            false
        ),
        'terminal-settings': GObject.ParamSpec.object(
            'terminal-settings',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            TerminalSettings
        ),
        'extension-dbus': GObject.ParamSpec.object(
            'extension-dbus',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.DBusProxy
        ),
        'display-config': GObject.ParamSpec.object(
            'display-config',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            DisplayConfig
        ),
        'maximize-setting': GObject.ParamSpec.boolean(
            'maximize-setting',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            false
        ),
        'position-setting': GObject.ParamSpec.string(
            'position-setting',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            'top'
        ),
        'resize-handle': GObject.ParamSpec.boolean(
            'resize-handle',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            true
        ),
        'transparent-background': GObject.ParamSpec.boolean(
            'transparent-background',
            null,
            null,
            GObject.ParamFlags.READWRITE,
            true
        ),
        'tab-show-shortcuts': GObject.ParamSpec.boolean(
            'tab-show-shortcuts',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            true
        ),
        'active-notebook': GObject.ParamSpec.object(
            'active-notebook',
            null,
            null,
            GObject.ParamFlags.READABLE,
            Notebook
        ),
        'is-empty': GObject.ParamSpec.boolean(
            'is-empty',
            null,
            null,
            GObject.ParamFlags.READABLE,
            false
        ),
        'is-split': GObject.ParamSpec.boolean(
            'is-split',
            null,
            null,
            GObject.ParamFlags.READABLE,
            false
        ),
        'split-layout': GObject.ParamSpec.string(
            'split-layout',
            null,
            null,
            GObject.ParamFlags.READABLE,
            'no-split'
        ),
    },
    Signals: {
        'session-update': {},
    },
},
class DDTermAppWindow extends Gtk.ApplicationWindow {
    _init(params) {
        super._init({
            window_position: Gtk.WindowPosition.CENTER,
            ...params,
        });

        let window_title_binding = null;
        this.paned.connect('set-focus-child', (paned, child) => {
            window_title_binding?.unbind();
            window_title_binding = child?.bind_property(
                'current-title',
                this,
                'title',
                GObject.BindingFlags.SYNC_CREATE
            );

            this.notify('active-notebook');
        });

        this.bind_notebook(this.notebook1);
        this.bind_notebook(this.notebook2);
        this.paned.set_focus_child(this.notebook1);

        this.paned.connect('notify::orientation', () => this.notify('split-layout'));
        this.connect('notify::is-split', () => this.notify('split-layout'));

        const move_page = (child, src, dst) => {
            this.freeze_notify();

            try {
                src.transfer_page(child, dst);
            } finally {
                this.thaw_notify();
            }
        };

        this.notebook1.connect(
            'move-to-other-pane',
            (_, page) => move_page(page, this.notebook1, this.notebook2)
        );

        this.notebook2.connect(
            'move-to-other-pane',
            (_, page) => move_page(page, this.notebook2, this.notebook1)
        );

        this._resize_box_north.connect(
            'button-press-event',
            this.start_resizing.bind(this, Gdk.WindowEdge.NORTH)
        );

        this._resize_box_south.connect(
            'button-press-event',
            this.start_resizing.bind(this, Gdk.WindowEdge.SOUTH)
        );

        this._resize_box_east.connect(
            'button-press-event',
            this.start_resizing.bind(this, Gdk.WindowEdge.EAST)
        );

        this._resize_box_west.connect(
            'button-press-event',
            this.start_resizing.bind(this, Gdk.WindowEdge.WEST)
        );

        const resize_ns = Gdk.Cursor.new_from_name(this.get_display(), 'ns-resize');
        const set_cursor_resize_ns = set_widget_cursor.bind(globalThis, resize_ns);

        this._resize_box_north.connect('realize', set_cursor_resize_ns);
        this._resize_box_south.connect('realize', set_cursor_resize_ns);

        const resize_ew = Gdk.Cursor.new_from_name(this.get_display(), 'ew-resize');
        const set_cursor_resize_ew = set_widget_cursor.bind(globalThis, resize_ew);

        this._resize_box_east.connect('realize', set_cursor_resize_ew);
        this._resize_box_west.connect('realize', set_cursor_resize_ew);

        this.connect('notify::position-setting', this.update_resize_handles.bind(this));
        this.connect('notify::resize-handle', this.update_resize_handles.bind(this));
        this.update_resize_handles();

        this.connect('notify::screen', () => this.update_visual());
        this.update_visual();

        const actions = {
            'toggle': this.toggle.bind(this),
            'show': () => this.present(),
            'hide': () => this.hide(),
            'split-position-inc': () => {
                const step = (this.paned.max_position - this.paned.min_position) / 10;
                this.paned.position = Math.min(this.paned.position + step, this.paned.max_position);
            },
            'split-position-dec': () => {
                const step = (this.paned.max_position - this.paned.min_position) / 10;
                this.paned.position = Math.max(this.paned.position - step, this.paned.min_position);
            },
            'focus-other-pane': () => {
                if (this.active_notebook === this.notebook1)
                    this.notebook2.grab_focus();
                else
                    this.notebook1.grab_focus();
            },
        };

        for (const [name, activate] of Object.entries(actions)) {
            const action = new Gio.SimpleAction({ name });
            action.connect('activate', activate);
            this.add_action(action);
        }

        ['split-position-inc', 'split-position-dec', 'focus-other-pane'].map(
            key => this.lookup_action(key)
        ).forEach(action => {
            this.bind_property('is-split', action, 'enabled', GObject.BindingFlags.SYNC_CREATE);
        });

        this.connect('notify::tab-show-shortcuts', () => this.update_show_shortcuts());
        this.connect('notify::active-notebook', () => this.update_show_shortcuts());
        this.update_show_shortcuts();

        this.connect('notify::is-empty', () => {
            if (this.is_empty)
                this.close();
        });

        this.connect('notify::split-orientation', () => {
            this.emit('session-update');
        });

        this.connect('notify::hide-on-close', this._hide_on_close.bind(this));

        this._hide_on_close();
        this._setup_size_sync();
    }

    _hide_on_close() {
        if (this._hide_on_close_handler)
            this.disconnect(this._hide_on_close_handler);

        if (!this.hide_on_close) {
            this._hide_on_close_handler = null;
            return;
        }

        this._hide_on_close_handler = this.connect('delete-event', () => {
            if (this.is_empty)
                return false;

            this.hide();
            return true;
        });
    }

    _setup_size_sync() {
        if (!this.extension_dbus || !this.display_config)
            return;  // App dev mode

        const display = this.get_display();

        if (display.constructor.$gtype.name !== 'GdkWaylandDisplay')
            return;

        const sync_if_hidden = () => {
            if (!this.is_visible())
                this.sync_size_with_extension();
        };

        const display_config_handler =
            this.display_config.connect('notify::layout-mode', sync_if_hidden);

        this.connect('destroy', () => this.display_config.disconnect(display_config_handler));

        const dbus_handler = this.extension_dbus.connect('g-properties-changed', sync_if_hidden);
        this.connect('destroy', () => this.extension_dbus.disconnect(dbus_handler));

        this.connect('notify::maximize-setting', sync_if_hidden);
        this.connect('notify::is-maximized', sync_if_hidden);

        this.connect('unmap-event', () => {
            this.sync_size_with_extension();
        });

        this.sync_size_with_extension();
    }

    bind_settings(settings) {
        settings.bind(
            'window-position',
            this,
            'position-setting',
            Gio.SettingsBindFlags.GET
        );

        settings.bind(
            'window-maximize',
            this,
            'maximize-setting',
            Gio.SettingsBindFlags.GET
        );

        settings.bind(
            'window-resizable',
            this,
            'resize-handle',
            Gio.SettingsBindFlags.GET
        );

        settings.bind(
            'transparent-background',
            this,
            'transparent-background',
            Gio.SettingsBindFlags.GET
        );

        settings.bind(
            'window-skip-taskbar',
            this,
            'skip-taskbar-hint',
            Gio.SettingsBindFlags.GET
        );

        settings.bind(
            'window-skip-taskbar',
            this,
            'skip-pager-hint',
            Gio.SettingsBindFlags.GET
        );

        settings.bind(
            'tab-show-shortcuts',
            this,
            'tab-show-shortcuts',
            Gio.SettingsBindFlags.GET
        );

        this.notebook1.bind_settings(settings);
        this.notebook2.bind_settings(settings);
    }

    bind_notebook(notebook) {
        const update_notebook_visibility = () => {
            notebook.visible = notebook.n_pages > 0;

            if (!notebook.get_visible())
                this.grab_focus();
        };

        notebook.connect('notify::n-pages', update_notebook_visibility);

        update_notebook_visibility();

        notebook.connect('notify::visible', () => {
            this.freeze_notify();
            this.notify('is-empty');
            this.notify('is-split');
            this.thaw_notify();
        });

        notebook.connect('split-layout', (_, page, mode) => {
            if (mode === 'no-split') {
                this.reset_layout();
                return;
            }

            this.paned.orientation =
                mode === 'vertical-split' ? Gtk.Orientation.HORIZONTAL : Gtk.Orientation.VERTICAL;

            if (this.is_split)
                return;

            if (notebook.n_pages > 1) {
                notebook.emit('move-to-other-pane', page);
            } else {
                const new_page = notebook.new_page();
                notebook.emit('move-to-other-pane', new_page);
                new_page.spawn();
            }
        });

        this.bind_property(
            'terminal-settings',
            notebook,
            'terminal-settings',
            GObject.BindingFlags.SYNC_CREATE
        );

        this.bind_property(
            'split-layout',
            notebook,
            'split-layout',
            GObject.BindingFlags.SYNC_CREATE
        );

        notebook.connect('session-update', () => {
            this.emit('session-update');
        });
    }

    toggle() {
        if (this.is_visible())
            this.hide();
        else
            this.present();
    }

    start_resizing(edge, source, event) {
        const [button_ok, button] = event.get_button();
        if (!button_ok || button !== Gdk.BUTTON_PRIMARY)
            return;

        const [coords_ok, x_root, y_root] = event.get_root_coords();
        if (!coords_ok)
            return;

        this.window.begin_resize_drag_for_device(
            edge,
            event.get_device(),
            button,
            x_root,
            y_root,
            event.get_time()
        );
    }

    update_visual() {
        const visual = this.screen.get_rgba_visual();

        if (visual)
            this.set_visual(visual);
    }

    sync_size_with_extension() {
        if (this.is_maximized) {
            if (this.maximize_setting)
                return;

            this.unmaximize();
        }

        const rect = this.extension_dbus.get_cached_property('TargetRect');

        if (!rect)
            return;

        let target_w = rect.get_child_value(2).get_int32();
        let target_h = rect.get_child_value(3).get_int32();

        if (this.display_config.layout_mode !== LayoutMode.LOGICAL) {
            const scale = this.extension_dbus.get_cached_property('TargetMonitorScale');

            if (!scale)
                return;

            const scale_unpacked = scale.get_double();

            target_w = Math.floor(target_w / scale_unpacked);
            target_h = Math.floor(target_h / scale_unpacked);
        }

        this.resize(target_w, target_h);
        this.window?.resize(target_w, target_h);
    }

    get active_notebook() {
        return this.paned.get_focus_child();
    }

    get is_empty() {
        return !this.notebook1.visible && !this.notebook2.visible;
    }

    get is_split() {
        return this.notebook1.visible && this.notebook2.visible;
    }

    get split_layout() {
        if (!this.is_split)
            return 'no-split';

        if (this.paned.orientation === Gtk.Orientation.HORIZONTAL)
            return 'vertical-split';

        return 'horizontal-split';
    }

    reset_layout() {
        if (!this.is_split)
            return;

        const dst = this.notebook1;
        const src = this.notebook2;
        const current_page = this.active_notebook?.current_child;

        this.freeze_notify();

        try {
            src.transfer_all_pages(dst);

            if (current_page)
                dst.current_child = current_page;
        } finally {
            this.thaw_notify();
        }
    }

    get transparent_background() {
        return this.get_style_context().has_class('transparent-background');
    }

    set transparent_background(value) {
        if (value)
            this.get_style_context().add_class('transparent-background');
        else
            this.get_style_context().remove_class('transparent-background');
    }

    update_resize_handles() {
        const { resize_handle, position_setting } = this;

        this._resize_box_south.visible = resize_handle && position_setting === 'top';
        this._resize_box_north.visible = resize_handle && position_setting === 'bottom';
        this._resize_box_east.visible = resize_handle && position_setting === 'left';
        this._resize_box_west.visible = resize_handle && position_setting === 'right';
    }

    update_show_shortcuts() {
        const { notebook1, notebook2 } = this;

        notebook1.tab_show_shortcuts =
            this.tab_show_shortcuts && notebook1 === this.active_notebook;

        notebook2.tab_show_shortcuts =
            this.tab_show_shortcuts && notebook2 === this.active_notebook;
    }

    vfunc_grab_focus() {
        if (this.active_notebook?.get_visible()) {
            this.active_notebook.grab_focus();
            return;
        }

        if (this.in_destruction())
            return;

        if (this.notebook1.visible)
            this.notebook1.grab_focus();
        else if (this.notebook2.visible)
            this.notebook2.grab_focus();
    }

    serialize_state() {
        if (this.is_empty)
            return null;

        const properties = GLib.VariantDict.new(null);

        properties.insert_value(
            'split-orientation',
            GLib.Variant.new_int32(this.paned.orientation)
        );

        if (this.paned.position_set && this.is_split) {
            const position_rel =
                this.paned.position / (this.paned.max_position - this.paned.min_position);

            properties.insert_value(
                'split-position',
                GLib.Variant.new_double(position_rel)
            );
        }

        properties.insert_value('notebook1', this.notebook1.serialize_state());
        properties.insert_value('notebook2', this.notebook2.serialize_state());

        return properties.end();
    }

    deserialize_state(variant) {
        const variant_dict_type = new GLib.VariantType('a{sv}');
        const dict = GLib.VariantDict.new(variant);
        const orientation = dict.lookup('split-orientation', 'i');
        const position = dict.lookup('split-position', 'd');
        const notebook1_data = dict.lookup_value('notebook1', variant_dict_type);
        const notebook2_data = dict.lookup_value('notebook2', variant_dict_type);

        if (orientation !== null)
            this.paned.orientation = orientation;

        if (notebook1_data)
            this.notebook1.deserialize_state(notebook1_data);

        if (notebook2_data)
            this.notebook2.deserialize_state(notebook2_data);

        if (position !== null)
            this.paned.position = (this.paned.max_position - this.paned.min_position) * position;
    }

    ensure_terminal() {
        if (this.is_empty)
            this.active_notebook.new_page().spawn();
    }
});
