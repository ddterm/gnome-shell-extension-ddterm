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

export class AppWindow extends Gtk.ApplicationWindow {
    static [GObject.GTypeName] = 'DDTermAppWindow';

    static [Gtk.template] =
        GLib.Uri.resolve_relative(import.meta.url, './ui/appwindow.ui', GLib.UriFlags.NONE);

    static [Gtk.children] = [
        'paned',
        'notebook1',
        'notebook2',
    ];

    static [Gtk.internalChildren] = [
        'resize_box_north',
        'drag_gesture_north',
        'resize_box_south',
        'drag_gesture_south',
        'resize_box_east',
        'drag_gesture_east',
        'resize_box_west',
        'drag_gesture_west',
    ];

    static [GObject.properties] = {
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
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            false
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
    };

    static [GObject.signals] = {
        'session-update': {},
    };

    static {
        GObject.registerClass(this);
    }

    #active_notebook = null;

    constructor(params) {
        super({
            window_position: Gtk.WindowPosition.CENTER,
            ...params,
        });

        const toggle_action = Gio.SimpleAction.new('toggle', null);
        toggle_action.connect('activate', this.toggle.bind(this));
        this.add_action(toggle_action);

        const show_action = Gio.SimpleAction.new('show', null);
        show_action.connect('activate', this.present.bind(this));
        this.add_action(show_action);

        const hide_action = Gio.SimpleAction.new('hide', null);
        hide_action.connect('activate', this.hide.bind(this));
        this.add_action(hide_action);

        const split_position_inc_action = Gio.SimpleAction.new('split-position-inc', null);
        split_position_inc_action.connect('activate', this.#split_position_inc.bind(this));
        this.bind_property(
            'is-split',
            split_position_inc_action,
            'enabled',
            GObject.BindingFlags.SYNC_CREATE
        );
        this.add_action(split_position_inc_action);

        const split_position_dec_action = Gio.SimpleAction.new('split-position-dec', null);
        split_position_dec_action.connect('activate', this.#split_position_dec.bind(this));
        this.bind_property(
            'is-split',
            split_position_dec_action,
            'enabled',
            GObject.BindingFlags.SYNC_CREATE
        );
        this.add_action(split_position_dec_action);

        const focus_other_pane_action = Gio.SimpleAction.new('focus-other-pane', null);
        focus_other_pane_action.connect('activate', this.#focus_other_pane.bind(this));
        this.bind_property(
            'is-split',
            focus_other_pane_action,
            'enabled',
            GObject.BindingFlags.SYNC_CREATE
        );
        this.add_action(focus_other_pane_action);

        for (const notebook of [this.notebook1, this.notebook2]) {
            this.bind_property(
                'terminal-settings',
                notebook,
                'terminal-settings',
                GObject.BindingFlags.SYNC_CREATE
            );
        }

        const resize_ns = Gdk.Cursor.new_from_name(this.get_display(), 'ns-resize');
        const resize_ew = Gdk.Cursor.new_from_name(this.get_display(), 'ew-resize');

        this._drag_gesture_north.edge = Gdk.WindowEdge.NORTH;
        this._resize_box_north.cursor = resize_ns;
        this._drag_gesture_south.edge = Gdk.WindowEdge.SOUTH;
        this._resize_box_south.cursor = resize_ns;
        this._drag_gesture_east.edge = Gdk.WindowEdge.EAST;
        this._resize_box_east.cursor = resize_ew;
        this._drag_gesture_west.edge = Gdk.WindowEdge.WEST;
        this._resize_box_west.cursor = resize_ew;

        this.connect('notify::position-setting', this.#update_resize_handles.bind(this));
        this.connect('notify::resize-handle', this.#update_resize_handles.bind(this));
        this.#update_resize_handles();

        this.connect('notify::screen', this.#update_visual.bind(this));
        this.#update_visual();

        this.connect('notify::tab-show-shortcuts', this.#update_show_shortcuts.bind(this));
        this.connect('notify::active-notebook', this.#update_show_shortcuts.bind(this));
        this.#update_show_shortcuts();

        this.connect('notify::is-empty', () => {
            if (this.is_empty)
                this.close();
        });

        this.#setup_size_sync();
    }

    get hide_on_close() {
        return Boolean(this._hide_on_close_handler);
    }

    set hide_on_close(enable) {
        if (enable === this.hide_on_close)
            return;

        if (this._hide_on_close_handler)
            this.disconnect(this._hide_on_close_handler);

        this._hide_on_close_handler = enable ? this.connect('delete-event', () => {
            if (this.is_empty)
                return false;

            this.hide();
            return true;
        }) : null;

        this.notify('hide-on-close');
    }

    #setup_size_sync() {
        if (!this.extension_dbus || !this.display_config)
            return;  // App dev mode

        const display = this.get_display();

        if (display.constructor.$gtype.name !== 'GdkWaylandDisplay')
            return;

        const sync_if_hidden = () => {
            if (!this.is_visible())
                this.#sync_size_with_extension();
        };

        const display_config_handler =
            this.display_config.connect('notify::layout-mode', sync_if_hidden);

        this.connect('destroy', () => this.display_config.disconnect(display_config_handler));

        const dbus_handler = this.extension_dbus.connect('g-properties-changed', sync_if_hidden);
        this.connect('destroy', () => this.extension_dbus.disconnect(dbus_handler));

        this.connect('notify::maximize-setting', sync_if_hidden);
        this.connect('notify::is-maximized', sync_if_hidden);

        this.connect('unmap-event', () => {
            this.#sync_size_with_extension();
        });

        this.#sync_size_with_extension();
    }

    _setup_widget_cursor(widget) {
        widget.window.cursor = widget.cursor;
    }

    _notebook_transfer_page(source, page) {
        const dest = source === this.notebook1 ? this.notebook2 : this.notebook1;

        this.freeze_notify();

        try {
            source.transfer_page(page, dest);
        } finally {
            this.thaw_notify();
        }
    }

    _paned_focus_child() {
        const active = this.paned.get_focus_child();

        if (this.#active_notebook === active)
            return;

        this.#active_notebook = active;

        this._window_title_binding?.unbind();
        this._window_title_binding = active?.bind_property(
            'current-title',
            this,
            'title',
            GObject.BindingFlags.SYNC_CREATE
        );

        this.notify('active-notebook');
    }

    _notify_split_layout() {
        this.notify('split-layout');
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

    _notebook_notify_n_pages(notebook) {
        notebook.visible = notebook.n_pages > 0;

        if (!notebook.get_visible())
            this.grab_focus();
    }

    _notebook_notify_visible() {
        this.freeze_notify();

        try {
            this.notify('is-empty');
            this.notify('is-split');
        } finally {
            this.thaw_notify();
        }
    }

    _notebook_split_layout(notebook, page, mode) {
        if (mode === 'no-split') {
            this.#reset_layout();
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
    }

    _emit_session_update() {
        this.emit('session-update');
    }

    toggle() {
        if (this.is_visible())
            this.hide();
        else
            this.present();
    }

    present() {
        // Discard any excess arguments - wrapper for use with .bind()
        super.present();
    }

    hide() {
        // Discard any excess arguments - wrapper for use with .bind()
        super.hide();
    }

    #split_position_inc() {
        const step = (this.paned.max_position - this.paned.min_position) / 10;
        this.paned.position = Math.min(this.paned.position + step, this.paned.max_position);
    }

    #split_position_dec() {
        const step = (this.paned.max_position - this.paned.min_position) / 10;
        this.paned.position = Math.max(this.paned.position - step, this.paned.min_position);
    }

    #focus_other_pane() {
        if (this.active_notebook === this.notebook1)
            this.notebook2.grab_focus();
        else
            this.notebook1.grab_focus();
    }

    _resize_drag(gesture, sequence) {
        const event = gesture.get_last_event(sequence);

        const [coords_ok, x_root, y_root] = event.get_root_coords();
        if (!coords_ok) {
            gesture.set_state(Gtk.EventSequenceState.DENIED);
            return;
        }

        this.window.begin_resize_drag_for_device(
            gesture.edge,
            event.get_device(),
            gesture.get_current_button(),
            x_root,
            y_root,
            event.get_time()
        );

        gesture.set_state(Gtk.EventSequenceState.CLAIMED);
        gesture.reset();
    }

    #update_visual() {
        const visual = this.get_screen()?.get_rgba_visual();

        if (visual)
            this.set_visual(visual);
    }

    #sync_size_with_extension() {
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
        return this.#active_notebook;
    }

    get is_empty() {
        return !this.notebook1?.visible && !this.notebook2?.visible;
    }

    get is_split() {
        return this.notebook1?.visible && this.notebook2?.visible;
    }

    get split_layout() {
        if (!this.is_split)
            return 'no-split';

        if (this.paned.orientation === Gtk.Orientation.HORIZONTAL)
            return 'vertical-split';

        return 'horizontal-split';
    }

    #reset_layout() {
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
        const context = this.get_style_context();

        if (value === context.has_class('transparent-background'))
            return;

        if (value)
            context.add_class('transparent-background');
        else
            context.remove_class('transparent-background');

        this.notify('transparent-background');
    }

    #update_resize_handles() {
        const { resize_handle, position_setting } = this;

        this._resize_box_south.visible = resize_handle && position_setting === 'top';
        this._resize_box_north.visible = resize_handle && position_setting === 'bottom';
        this._resize_box_east.visible = resize_handle && position_setting === 'left';
        this._resize_box_west.visible = resize_handle && position_setting === 'right';
    }

    #update_show_shortcuts() {
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
            (this.active_notebook ?? this.notebook1).new_page().spawn();
    }
}
