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
    const box = new Gtk.EventBox({ visible: true });

    new Gtk.Separator({
        visible: true,
        orientation,
        parent: box,
        margin_top: orientation === Gtk.Orientation.HORIZONTAL ? 2 : 0,
        margin_bottom: orientation === Gtk.Orientation.HORIZONTAL ? 2 : 0,
        margin_start: orientation === Gtk.Orientation.VERTICAL ? 2 : 0,
        margin_end: orientation === Gtk.Orientation.VERTICAL ? 2 : 0,
    });

    box.connect('realize', () => {
        box.window.cursor = Gdk.Cursor.new_from_name(
            box.get_display(),
            orientation === Gtk.Orientation.VERTICAL ? 'ew-resize' : 'ns-resize'
        );
    });

    return box;
}

const WINDOW_POS_TO_RESIZE_EDGE = {
    top: Gdk.WindowEdge.SOUTH,
    bottom: Gdk.WindowEdge.NORTH,
    left: Gdk.WindowEdge.EAST,
    right: Gdk.WindowEdge.WEST,
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
            Gdk.WindowEdge,
            Gdk.WindowEdge.SOUTH
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
},
class DDTermAppWindow extends Gtk.ApplicationWindow {
    _init(params) {
        super._init({
            title: Gettext.gettext('ddterm'),
            icon_name: 'utilities-terminal',
            window_position: Gtk.WindowPosition.CENTER,
            ...params,
        });

        this.menus =
            Gtk.Builder.new_from_file(get_resource_file('./ui/menus.ui').get_path());

        const grid = new Gtk.Grid({
            parent: this,
            visible: true,
        });

        this.paned = new Gtk.Paned({
            visible: true,
            border_width: 0,
            hexpand: true,
            vexpand: true,
        });
        grid.attach(this.paned, 1, 1, 1, 1);

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

        const notebook1 = this.create_notebook();
        this.paned.pack1(notebook1, true, false);
        this.paned.set_focus_child(notebook1);

        const notebook2 = this.create_notebook();
        this.paned.pack2(notebook2, true, false);

        this.paned.connect('notify::orientation', () => this.notify('split-layout'));
        this.connect('notify::is-split', () => this.notify('split-layout'));

        const move_page = (child, src, dst) => {
            const label = src.get_tab_label(child);
            this.freeze_notify();

            try {
                src.remove(child);
                dst.insert_page(child, label, -1);
            } finally {
                this.thaw_notify();
            }
        };

        notebook1.connect('move-to-other-pane', (_, page) => move_page(page, notebook1, notebook2));
        notebook2.connect('move-to-other-pane', (_, page) => move_page(page, notebook2, notebook1));

        this.connect('notify::tab-label-width', this.update_tab_label_width.bind(this));
        this.connect('configure-event', this.update_tab_label_width.bind(this));
        this.update_tab_label_width();

        this.settings.bind(
            'tab-label-width',
            this,
            'tab-label-width',
            Gio.SettingsBindFlags.GET
        );

        const add_resize_box = (edge, x, y, orientation) => {
            const box = make_resizer(orientation);
            box.connect('button-press-event', this.start_resizing.bind(this, edge));
            grid.attach(box, x, y, 1, 1);

            const update_visible = () => {
                box.visible = this.resize_handle && this.resize_edge === edge;
            };

            this.connect('notify::resize-handle', update_visible);
            this.connect('notify::resize-edge', update_visible);
            update_visible();
        };

        add_resize_box(Gdk.WindowEdge.SOUTH, 1, 2, Gtk.Orientation.HORIZONTAL);
        add_resize_box(Gdk.WindowEdge.NORTH, 1, 0, Gtk.Orientation.HORIZONTAL);
        add_resize_box(Gdk.WindowEdge.EAST, 2, 1, Gtk.Orientation.VERTICAL);
        add_resize_box(Gdk.WindowEdge.WEST, 0, 1, Gtk.Orientation.VERTICAL);

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

        this.connect('notify::screen', () => this.update_visual());
        this.update_visual();

        this.draw_handler = null;
        this.connect('notify::app-paintable', this.setup_draw_handler.bind(this));
        this.setup_draw_handler();

        this.settings.bind(
            'transparent-background',
            this,
            'app-paintable',
            Gio.SettingsBindFlags.GET
        );

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
            'window-skip-taskbar',
            this,
            'skip-taskbar-hint',
            Gio.SettingsBindFlags.GET
        );

        this.settings.bind(
            'window-skip-taskbar',
            this,
            'skip-pager-hint',
            Gio.SettingsBindFlags.GET
        );

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
            if (this.is_empty) {
                this.application.save_session();
                this.close();
            }
        });

        this._hide_on_close();
        this._setup_size_sync();
    }

    _hide_on_close() {
        this.connect('delete-event', () => {
            if (this.is_empty)
                return false;

            this.hide();
            return true;
        });
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

        this.connect('unmap-event', () => {
            this.sync_size_with_extension();
        });

        this.sync_size_with_extension();
    }

    create_notebook() {
        const notebook = new Notebook({
            terminal_settings: this.terminal_settings,
            scrollable: true,
            group_name: 'ddtermnotebook',
            menus: this.menus,
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

        return notebook;
    }

    setup_draw_handler() {
        if (this.app_paintable) {
            if (!this.draw_handler)
                this.draw_handler = this.connect('draw', this.draw.bind(this));
        } else if (this.draw_handler) {
            this.disconnect(this.draw_handler);
            this.draw_handler = null;
        }

        this.queue_draw();
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

    draw(_widget, cr) {
        try {
            if (!this.app_paintable)
                return false;

            if (!Gtk.cairo_should_draw_window(cr, this.window))
                return false;

            const context = this.get_style_context();
            const allocation = this.get_child().get_allocation();
            Gtk.render_background(
                context, cr, allocation.x, allocation.y, allocation.width, allocation.height
            );
            Gtk.render_frame(
                context, cr, allocation.x, allocation.y, allocation.width, allocation.height
            );
        } finally {
            cr.$dispose();
        }

        return false;
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

        this.resize(target_w, target_h);
        this.window?.resize(target_w, target_h);
    }

    update_tab_label_width() {
        const [width] = this.get_size();
        const tab_label_width = Math.floor(this.tab_label_width * width);

        this.paned.foreach(child => {
            child.tab_label_width = tab_label_width;
        });
    }

    get active_notebook() {
        return this.paned.get_focus_child();
    }

    get is_empty() {
        return this.paned.get_children().every(nb => !nb.get_visible());
    }

    get is_split() {
        return this.paned.get_children().every(nb => nb.get_visible());
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

        const dst = this.paned.get_child1();
        const src = this.paned.get_child2();
        const current_page = this.active_notebook?.current_child;

        this.freeze_notify();

        try {
            for (const child of src.get_children()) {
                const label = src.get_tab_label(child);

                src.remove(child);
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
        this.paned.foreach(child => {
            child.tab_show_shortcuts = this.tab_show_shortcuts && child === this.active_notebook;
        });
    }

    vfunc_grab_focus() {
        if (this.active_notebook?.get_visible()) {
            this.active_notebook.grab_focus();
            return;
        }

        for (const notebook of this.paned.get_children()) {
            if (notebook.get_visible()) {
                notebook.grab_focus();
                return;
            }
        }
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

        properties.insert_value('notebook1', this.paned.get_child1().serialize_state());
        properties.insert_value('notebook2', this.paned.get_child2().serialize_state());

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
            this.paned.get_child1().deserialize_state(notebook1_data);

        if (notebook2_data)
            this.paned.get_child2().deserialize_state(notebook2_data);

        if (position !== null)
            this.paned.position = (this.paned.max_position - this.paned.min_position) * position;
    }

    ensure_terminal() {
        if (this.is_empty)
            this.active_notebook.new_page().spawn();
    }
});
