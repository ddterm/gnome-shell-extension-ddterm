// SPDX-FileCopyrightText: 2020 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';

import Gettext from 'gettext';

import { TerminalSettings } from './terminalsettings.js';
import { Notebook } from './notebook.js';
import { get_resource_file } from './resources.js';
import { DisplayConfig, LayoutMode } from '../util/displayconfig.js';

function make_resizer(orientation) {
    const box = new Gtk.Separator({
        visible: true,
        orientation,
        margin_top: orientation === Gtk.Orientation.HORIZONTAL ? 2 : 0,
        margin_bottom: orientation === Gtk.Orientation.HORIZONTAL ? 2 : 0,
        margin_start: orientation === Gtk.Orientation.VERTICAL ? 2 : 0,
        margin_end: orientation === Gtk.Orientation.VERTICAL ? 2 : 0,
    });

    box.cursor = Gdk.Cursor.new_from_name(
        orientation === Gtk.Orientation.VERTICAL ? 'ew-resize' : 'ns-resize',
        null
    );

    return box;
}

const WINDOW_POS_TO_RESIZE_EDGE = {
    top: Gdk.SurfaceEdge.SOUTH,
    bottom: Gdk.SurfaceEdge.NORTH,
    left: Gdk.SurfaceEdge.EAST,
    right: Gdk.SurfaceEdge.WEST,
};

export const AppWindow = GObject.registerClass({
    Properties: {
        'settings': GObject.ParamSpec.object(
            'settings',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.Settings
        ),
        'terminal-settings': GObject.ParamSpec.object(
            'terminal-settings',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            TerminalSettings
        ),
        'extension-dbus': GObject.ParamSpec.object(
            'extension-dbus',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.DBusProxy
        ),
        'display-config': GObject.ParamSpec.object(
            'display-config',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            DisplayConfig
        ),
        'resize-handle': GObject.ParamSpec.boolean(
            'resize-handle',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            true
        ),
        'resize-edge': GObject.ParamSpec.enum(
            'resize-edge',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            Gdk.SurfaceEdge,
            Gdk.SurfaceEdge.SOUTH
        ),
        'tab-label-width': GObject.ParamSpec.double(
            'tab-label-width',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            0.0,
            0.5,
            0.1
        ),
        'tab-show-shortcuts': GObject.ParamSpec.boolean(
            'tab-show-shortcuts',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            true
        ),
        'active-notebook': GObject.ParamSpec.object(
            'active-notebook',
            '',
            '',
            GObject.ParamFlags.READABLE,
            Notebook
        ),
        'is-empty': GObject.ParamSpec.boolean(
            'is-empty',
            '',
            '',
            GObject.ParamFlags.READABLE,
            false
        ),
        'is-split': GObject.ParamSpec.boolean(
            'is-split',
            '',
            '',
            GObject.ParamFlags.READABLE,
            false
        ),
        'split-layout': GObject.ParamSpec.string(
            'split-layout',
            '',
            '',
            GObject.ParamFlags.READABLE,
            'no-split'
        ),
    },
    Signals: {
        'size-allocate': {
            param_types: [GObject.TYPE_INT, GObject.TYPE_INT],
        },
    },
},
class DDTermAppWindow extends Gtk.ApplicationWindow {
    _init(params) {
        super._init({
            title: Gettext.gettext('ddterm'),
            icon_name: 'utilities-terminal',
            ...params,
        });

        this.menus =
            Gtk.Builder.new_from_file(get_resource_file('./ui/menus.ui').get_path());

        const grid = new Gtk.Grid({ visible: true });

        this.set_child(grid);

        this.paned = new Gtk.Paned({
            visible: true,
            hexpand: true,
            vexpand: true,
            shrink_start_child: false,
            shrink_end_child: false,
        });
        grid.attach(this.paned, 1, 1, 1, 1);

        let window_title_binding = null;
        this.connect('notify::focus-widget', () => {
            if (window_title_binding?.dup_source() === this.active_notebook)
                return;

            window_title_binding?.unbind();
            window_title_binding = this.active_notebook?.bind_property(
                'current-title',
                this,
                'title',
                GObject.BindingFlags.SYNC_CREATE
            );

            this.notify('active-notebook');
        });

        const notebook1 = this.create_notebook();
        this.paned.set_start_child(notebook1);
        this.paned.set_focus_child(notebook1);

        const notebook2 = this.create_notebook();
        this.paned.set_end_child(notebook2);

        this.paned.connect('notify::orientation', () => this.notify('split-layout'));
        this.connect('notify::is-split', () => this.notify('split-layout'));

        const move_page = (child, src, dst) => {
            const label = src.get_tab_label(child);
            this.freeze_notify();

            try {
                src.remove_page(src.page_num(child));
                dst.insert_page(child, label, -1);
            } finally {
                this.thaw_notify();
            }
        };

        notebook1.connect('move-to-other-pane', (_, page) => move_page(page, notebook1, notebook2));
        notebook2.connect('move-to-other-pane', (_, page) => move_page(page, notebook2, notebook1));

        this.connect('notify::tab-label-width', this.update_tab_label_width.bind(this));
        this.connect('realize', () => {
            this.get_surface().connect('notify::width', this.update_tab_label_width.bind(this));
        });
        this.update_tab_label_width();

        this.settings.bind(
            'tab-label-width',
            this,
            'tab-label-width',
            Gio.SettingsBindFlags.GET
        );

        const add_resize_box = (edge, x, y, orientation) => {
            const box = make_resizer(orientation);
            const gesture = Gtk.GestureClick.new();

            gesture.set_button(Gdk.BUTTON_PRIMARY);
            gesture.connect('pressed', this.start_resizing.bind(this, edge));
            box.add_controller(gesture);
            grid.attach(box, x, y, 1, 1);

            const update_visible = () => {
                box.visible = this.resize_handle && this.resize_edge === edge;
            };

            this.connect('notify::resize-handle', update_visible);
            this.connect('notify::resize-edge', update_visible);
            update_visible();
        };

        add_resize_box(Gdk.SurfaceEdge.SOUTH, 1, 2, Gtk.Orientation.HORIZONTAL);
        add_resize_box(Gdk.SurfaceEdge.NORTH, 1, 0, Gtk.Orientation.HORIZONTAL);
        add_resize_box(Gdk.SurfaceEdge.EAST, 2, 1, Gtk.Orientation.VERTICAL);
        add_resize_box(Gdk.SurfaceEdge.WEST, 0, 1, Gtk.Orientation.VERTICAL);

        this.settings.bind(
            'window-resizable',
            this,
            'resize-handle',
            Gio.SettingsBindFlags.GET
        );

        const edge_handler = this.settings.connect('changed::window-position', () => {
            this.update_window_pos();
        });
        this.connect('destroy', () => this.settings.disconnect(edge_handler));
        this.update_window_pos();

        const HEIGHT_MOD = 0.05;
        const OPACITY_MOD = 0.05;

        const actions = {
            'toggle': this.toggle.bind(this),
            'show': () => this.present(),
            'hide': () => this.hide(),
            'window-size-dec': () => {
                if (this.settings.get_boolean('window-maximize'))
                    this.settings.set_double('window-size', 1.0 - HEIGHT_MOD);
                else
                    this.adjust_double_setting('window-size', -HEIGHT_MOD);
            },
            'window-size-inc': () => {
                if (!this.settings.get_boolean('window-maximize'))
                    this.adjust_double_setting('window-size', HEIGHT_MOD);
            },
            'background-opacity-dec': () => {
                this.adjust_double_setting('background-opacity', -OPACITY_MOD);
            },
            'background-opacity-inc': () => {
                this.adjust_double_setting('background-opacity', OPACITY_MOD);
            },
            'split-position-inc': () => {
                const step = (this.paned.max_position - this.paned.min_position) / 10;
                this.paned.position = Math.min(this.paned.position + step, this.paned.max_position);
            },
            'split-position-dec': () => {
                const step = (this.paned.max_position - this.paned.min_position) / 10;
                this.paned.position = Math.max(this.paned.position - step, this.paned.min_position);
            },
            'focus-other-pane': () => {
                if (this.active_notebook === notebook1)
                    notebook2.grab_focus();
                else
                    notebook1.grab_focus();
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

        this.settings.bind(
            'tab-show-shortcuts',
            this,
            'tab-show-shortcuts',
            Gio.SettingsBindFlags.GET
        );

        this.connect('notify::tab-show-shortcuts', () => this.update_show_shortcuts());
        this.connect('notify::active-notebook', () => this.update_show_shortcuts());
        this.update_show_shortcuts();

        this.connect('notify::is-empty', () => {
            if (this.is_empty)
                this.close();
        });

        this.settings.connect('changed::window-skip-taskbar', this.update_skip_taskbar.bind(this));
        this.connect('realize', this.update_skip_taskbar.bind(this));
        this.update_skip_taskbar();

        this._setup_size_sync();
    }

    _setup_size_sync() {
        const display = this.get_display();

        if (display.constructor.$gtype.name !== 'GdkWaylandDisplay')
            return;

        const display_config_handler = this.display_config.connect('notify::layout-mode', () => {
            if (!this.is_visible())
                this.sync_size_with_extension();
        });

        this.connect('destroy', () => this.display_config.disconnect(display_config_handler));

        const dbus_handler = this.extension_dbus.connect(
            'g-properties-changed',
            () => {
                if (!this.is_visible())
                    this.sync_size_with_extension();
            }
        );

        this.connect('destroy', () => this.extension_dbus.disconnect(dbus_handler));

        this.connect('unmap', () => {
            this.sync_size_with_extension();
        });

        this.sync_size_with_extension();
    }

    vfunc_size_allocate(width, height, baseline) {
        super.vfunc_size_allocate(width, height, baseline);
        this.emit('size-allocate', width, height);
    }

    create_notebook() {
        const notebook = new Notebook({
            terminal_settings: this.terminal_settings,
            scrollable: true,
            group_name: 'ddtermnotebook',
            menus: this.menus,
            visible: false,
        });

        const update_notebook_visibility = () => {
            notebook.visible = notebook.get_n_pages() > 0;

            if (!notebook.get_visible())
                this.grab_focus();
        };

        notebook.connect('page-added', update_notebook_visibility);
        notebook.connect('page-removed', update_notebook_visibility);

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

            if (notebook.get_n_pages() > 1) {
                notebook.emit('move-to-other-pane', page);
            } else {
                const new_page = notebook.new_page();
                notebook.emit('move-to-other-pane', new_page);
                new_page.spawn();
            }
        });

        this.bind_property(
            'split-layout',
            notebook,
            'split-layout',
            GObject.BindingFlags.SYNC_CREATE
        );

        this.settings.bind(
            'new-tab-button',
            notebook,
            'show-new-tab-button',
            Gio.SettingsBindFlags.GET
        );

        this.settings.bind(
            'new-tab-front-button',
            notebook,
            'show-new-tab-front-button',
            Gio.SettingsBindFlags.GET
        );

        this.settings.bind(
            'tab-switcher-popup',
            notebook,
            'show-tab-switch-popup',
            Gio.SettingsBindFlags.GET
        );

        this.settings.bind(
            'tab-policy',
            notebook,
            'tab-policy',
            Gio.SettingsBindFlags.GET
        );

        this.settings.bind(
            'tab-position',
            notebook,
            'tab-pos',
            Gio.SettingsBindFlags.GET
        );

        this.settings.bind(
            'tab-expand',
            notebook,
            'tab-expand',
            Gio.SettingsBindFlags.GET
        );

        this.settings.bind(
            'notebook-border',
            notebook,
            'show-border',
            Gio.SettingsBindFlags.GET
        );

        this.settings.bind(
            'tab-label-ellipsize-mode',
            notebook,
            'tab-label-ellipsize-mode',
            Gio.SettingsBindFlags.GET
        );

        this.settings.bind(
            'tab-close-buttons',
            notebook,
            'tab-close-buttons',
            Gio.SettingsBindFlags.GET
        );

        const save_session = this.application.save_session.bind(this.application);

        notebook.connect('page-added', save_session);
        notebook.connect('page-removed', save_session);
        notebook.connect('page-reordered', save_session);

        return notebook;
    }

    adjust_double_setting(name, difference, min = 0.0, max = 1.0) {
        const current = this.settings.get_double(name);
        const new_setting = current + difference;
        this.settings.set_double(name, Math.min(Math.max(new_setting, min), max));
    }

    toggle() {
        if (this.is_visible())
            this.hide();
        else
            this.present();
    }

    start_resizing(edge, gesture) {
        const event = gesture.get_current_event();
        const button = event.get_button?.() ?? 0;
        const [coords_ok, x_root, y_root] = event.get_position();
        if (!coords_ok)
            return;

        gesture.set_state(Gtk.EventSequenceState.CLAIMED);

        this.get_surface().begin_resize(
            edge,
            event.get_device(),
            button,
            x_root,
            y_root,
            event.get_time()
        );

        gesture.reset();
    }

    sync_size_with_extension() {
        if (this.is_maximized)
            return;

        const rect = this.extension_dbus.TargetRect;

        if (!rect)
            return;

        let [, , target_w, target_h] = rect;

        if (this.display_config.layout_mode !== LayoutMode.LOGICAL) {
            const scale = this.extension_dbus.TargetMonitorScale;

            if (!scale)
                return;

            target_w = Math.floor(target_w / scale);
            target_h = Math.floor(target_h / scale);
        }

        this.set_default_size(target_w, target_h);
    }

    update_tab_label_width() {
        const tab_label_width = Math.floor(this.tab_label_width * this.get_width());
        const { start_child, end_child } = this.paned;

        start_child.tab_label_width = tab_label_width;
        end_child.tab_label_width = tab_label_width;
    }

    get active_notebook() {
        return this.paned.get_focus_child();
    }

    get is_empty() {
        const { start_child, end_child } = this.paned;

        return !start_child?.get_visible() && !end_child?.get_visible();
    }

    get is_split() {
        const { start_child, end_child } = this.paned;

        return start_child?.get_visible() && end_child?.get_visible();
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

        const dst = this.paned.start_child;
        const src = this.paned.end_child;
        const current_page = this.active_notebook?.current_child;

        this.freeze_notify();

        try {
            while (src.get_n_pages()) {
                const child = src.get_nth_page(0);
                const label = src.get_tab_label(child);

                src.remove_page(0);
                dst.insert_page(child, label, -1);
            }

            if (current_page)
                dst.set_current_page(dst.page_num(current_page));
        } finally {
            this.thaw_notify();
        }
    }

    update_window_pos() {
        const pos = this.settings.get_string('window-position');

        this.resize_edge = WINDOW_POS_TO_RESIZE_EDGE[pos];
    }

    update_show_shortcuts() {
        const { start_child, end_child } = this.paned;

        start_child.tab_show_shortcuts =
            this.tab_show_shortcuts && start_child === this.active_notebook;

        end_child.tab_show_shortcuts =
            this.tab_show_shortcuts && end_child === this.active_notebook;
    }

    update_skip_taskbar() {
        const surface = this.get_surface();

        if (surface?.constructor.$gtype.name !== 'GdkX11Toplevel')
            return;

        const skip = this.settings.get_boolean('window-skip-taskbar');

        surface.set_skip_taskbar_hint(skip);
        surface.set_skip_pager_hint(skip);
    }

    vfunc_grab_focus() {
        if (this.active_notebook?.get_visible()) {
            this.active_notebook.grab_focus();
            return;
        }

        if (this.paned.start_child?.get_visible())
            this.paned.start_child.grab_focus();
        else if (this.paned.end_child?.get_visible())
            this.paned.end_child.grab_focus();
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

        properties.insert_value('notebook1', this.paned.start_child.serialize_state());
        properties.insert_value('notebook2', this.paned.end_child.serialize_state());

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
            this.paned.start_child.deserialize_state(notebook1_data);

        if (notebook2_data)
            this.paned.end_child.deserialize_state(notebook2_data);

        if (position !== null)
            this.paned.position = (this.paned.max_position - this.paned.min_position) * position;
    }

    ensure_terminal() {
        if (this.is_empty)
            this.active_notebook.new_page().spawn();
    }
});
