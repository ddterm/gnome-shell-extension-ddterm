'use strict';

imports.gi.versions.GLib = '2.0';
imports.gi.versions.GObject = '2.0';
imports.gi.versions.Gio = '2.0';
imports.gi.versions.Gdk = '3.0';
imports.gi.versions.Gtk = '3.0';
imports.gi.versions.Pango = '1.0';
imports.gi.versions.Vte = '2.91';

const System = imports.system;
const { GLib, GObject, Gio, Gdk, Gtk, Pango, Vte } = imports.gi;

const APP_DATA_DIR = Gio.File.new_for_commandline_arg(System.programInvocationName).get_parent();

imports.searchPath.unshift(APP_DATA_DIR.get_path());

function get_settings() {
    const source = Gio.SettingsSchemaSource.new_from_directory(
        APP_DATA_DIR.get_child('schemas').get_path(),
        Gio.SettingsSchemaSource.get_default(),
        false
    );

    return new Gio.Settings({
        settings_schema: source.lookup('com.github.amezin.ddterm', true),
    });
}

function simple_action(group, name, callback) {
    const action = new Gio.SimpleAction({
        name,
    });

    action.connect('activate', callback);
    group.add_action(action);

    return action;
}

function setup_popup_menu(widget, menu) {
    menu.attach_widget = widget;

    widget.connect('button-press-event', (_, event) => {
        if (!event.triggers_context_menu())
            return false;

        menu.popup_at_pointer(event);
        return true;
    });

    widget.connect('popup-menu', () => {
        menu.popup_at_pointer(null);
        return true;
    });
}

function bind_settings_ro(settings, key, target, property = null) {
    if (!property)
        property = key;

    settings.bind(key, target, property, Gio.SettingsBindFlags.GET | Gio.SettingsBindFlags.NO_SENSITIVITY);
}

GObject.registerClass(
    {
        GTypeName: 'DDTermTerminal',
        Properties: {
            'has-selection': GObject.ParamSpec.boolean(
                'has-selection', '', '', GObject.ParamFlags.READABLE | GObject.ParamFlags.EXPLICIT_NOTIFY, false
            ),
            'custom-font': GObject.ParamSpec.string(
                'custom-font', '', '', GObject.ParamFlags.READWRITE, null
            ),
            'use-custom-font': GObject.ParamSpec.boolean(
                'use-custom-font', '', '', GObject.ParamFlags.READWRITE, false
            ),
            'background-opacity': GObject.ParamSpec.double(
                'background-opacity', '', '', GObject.ParamFlags.WRITABLE, 0, 1, 1
            ),
        },
    },
    class Terminal extends Vte.Terminal {
        _init(params) {
            super._init(params);

            this.connect('selection-changed', () => {
                this.notify('has-selection');
            });

            const actions = new Gio.SimpleActionGroup();
            this.insert_action_group('terminal', actions);

            const copy_action = simple_action(actions, 'copy', this.copy.bind(this));
            this.bind_property('has-selection', copy_action, 'enabled', GObject.BindingFlags.DEFAULT | GObject.BindingFlags.SYNC_CREATE);

            const copy_html_action = simple_action(actions, 'copy-html', this.copy_html.bind(this));
            this.bind_property('has-selection', copy_html_action, 'enabled', GObject.BindingFlags.DEFAULT | GObject.BindingFlags.SYNC_CREATE);

            simple_action(actions, 'paste', this.paste.bind(this));
            simple_action(actions, 'select-all', this.select_all.bind(this));

            this.settings = get_settings();
            this.connect('destroy', () => this.settings.run_dispose());

            this.desktop_settings = new Gio.Settings({
                schema_id: 'org.gnome.desktop.interface',
            });
            this.connect('destroy', () => this.desktop_settings.run_dispose());

            bind_settings_ro(this.settings, 'custom-font', this);
            bind_settings_ro(this.settings, 'use-custom-font', this);
            bind_settings_ro(this.settings, 'background-opacity', this);

            this.connect('notify::custom-font', this.update_font.bind(this));
            this.connect('notify::use-custom-font', this.update_font.bind(this));
            this.desktop_settings.connect('changed::monospace-font-name', this.update_font.bind(this));
            this.update_font();
        }

        set background_opacity(value) {
            this.set_color_background(new Gdk.RGBA({
                red: 0,
                green: 0,
                blue: 0,
                alpha: value,
            }));
        }

        update_font() {
            const font_name = this.use_custom_font ? this.custom_font : this.desktop_settings.get_string('monospace-font-name');
            this.font_desc = Pango.FontDescription.from_string(font_name);
        }

        get has_selection() {
            return this.get_has_selection();
        }

        copy() {
            this.copy_clipboard_format(Vte.Format.TEXT);
        }

        copy_html() {
            this.copy_clipboard_format(Vte.Format.HTML);
        }

        paste() {
            this.paste_clipboard();
        }

        select_all() {
            super.select_all();
        }
    }
);

const TerminalPage = GObject.registerClass(
    {
        Template: APP_DATA_DIR.get_child('terminalpage.ui').get_uri(),
        Children: ['terminal', 'tab_label', 'tab_label_label', 'menu_label'],
        Properties: {
            'menus': GObject.ParamSpec.object(
                'menus', '', '', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, Gtk.Builder
            ),
        },
        Signals: {
            'close-request': {},
        },
    },
    class TerminalPage extends Gtk.Box {
        _init(params) {
            super._init(params);

            this.terminal.connect('child-exited', this.close_request.bind(this));

            this.terminal.bind_property('window-title', this.menu_label, 'label', GObject.BindingFlags.DEFAULT);
            this.terminal.bind_property('window-title', this.tab_label_label, 'label', GObject.BindingFlags.DEFAULT);

            const popup_menu = Gtk.Menu.new_from_model(this.menus.get_object('terminal-popup'));
            setup_popup_menu(this.terminal, popup_menu);

            const tab_popup_menu = Gtk.Menu.new_from_model(this.menus.get_object('tab-popup'));
            setup_popup_menu(this.tab_label, tab_popup_menu);

            const actions = new Gio.SimpleActionGroup();
            this.insert_action_group('page', actions);
            this.tab_label.insert_action_group('page', actions);

            simple_action(actions, 'close', this.close_request.bind(this));
        }

        spawn() {
            this.terminal.spawn_async(
                Vte.PtyFlags.DEFAULT, null, [Vte.get_user_shell()], null, GLib.SpawnFlags.SEARCH_PATH, null, -1, null, this.spawn_callback.bind(this)
            );
        }

        spawn_callback(_terminal, _pid, error) {
            if (error)
                this.terminal.feed(error.message);
        }

        close_request() {
            this.emit('close-request');
        }
    }
);

const AppWindow = GObject.registerClass(
    {
        Template: APP_DATA_DIR.get_child('appwindow.ui').get_uri(),
        Children: ['notebook', 'resize_box', 'tab_switch_button'],
        Properties: {
            'menus': GObject.ParamSpec.object(
                'menus', '', '', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, Gtk.Builder
            ),
        },
    },
    class AppWindow extends Gtk.ApplicationWindow {
        _init(params) {
            super._init(params);

            this.connect('realize', this.set_wm_functions.bind(this));

            this.connect('screen-changed', this.setup_rgba_visual.bind(this));
            this.setup_rgba_visual();

            this.notebook.connect('page-removed', this.close_if_no_pages.bind(this));

            this.toggle_action = simple_action(this, 'toggle', this.toggle.bind(this));
            simple_action(this, 'new-tab', this.new_tab.bind(this));

            this.resize_box.connect('realize', this.set_resize_cursor.bind(this));
            this.resize_box.connect('button-press-event', this.start_resizing.bind(this));

            this.tab_select_action = new Gio.PropertyAction({
                name: 'select-tab',
                object: this.notebook,
                property_name: 'page',
            });
            this.add_action(this.tab_select_action);

            this.tab_select_menu = new Gio.Menu();
            this.tab_switch_button.set_menu_model(this.tab_select_menu);
            this.tab_switch_button.connect('toggled', this.update_tab_select_menu.bind(this));

            this.new_tab();
        }

        set_wm_functions() {
            this.window.set_functions(Gdk.WMFunction.MOVE | Gdk.WMFunction.RESIZE | Gdk.WMFunction.CLOSE);
        }

        update_tab_select_menu() {
            this.tab_select_menu.remove_all();

            for (let i = 0; i < this.notebook.get_n_pages(); i += 1) {
                const label = this.notebook.get_menu_label_text(this.notebook.get_nth_page(i));
                this.tab_select_menu.append(label, `win.select-tab(${i})`);
            }
        }

        toggle() {
            if (this.visible)
                this.hide();
            else
                this.show();
        }

        new_tab() {
            const page = new TerminalPage({
                menus: this.menus,
            });

            const index = this.notebook.append_page_menu(page, page.tab_label, page.menu_label);
            this.notebook.set_current_page(index);
            this.notebook.set_tab_reorderable(page, true);
            this.notebook.child_set_property(page, 'tab-expand', true);

            page.connect('close-request', this.remove_page.bind(this));
            page.spawn();
        }

        setup_rgba_visual() {
            const visual = this.screen.get_rgba_visual();
            if (visual)
                this.set_visual(visual);
        }

        remove_page(page) {
            this.notebook.remove(page);
            page.destroy();
        }

        close_if_no_pages() {
            if (this.notebook.get_n_pages() === 0)
                this.close();
        }

        set_resize_cursor(widget) {
            widget.window.cursor = Gdk.Cursor.new_from_name(widget.get_display(), 'ns-resize');
        }

        start_resizing(_, event) {
            const [button_ok, button] = event.get_button();
            if (!button_ok || button !== Gdk.BUTTON_PRIMARY)
                return;

            const [coords_ok, x_root, y_root] = event.get_root_coords();
            if (!coords_ok)
                return;

            this.begin_resize_drag(Gdk.WindowEdge.SOUTH, button, x_root, y_root, event.get_time());
        }
    }
);

const PrefsWidget = imports.prefs.createPrefsWidgetClass(APP_DATA_DIR);

const PrefsDialog = GObject.registerClass(
    {
        Template: APP_DATA_DIR.get_child('prefsdialog.ui').get_uri(),
        Properties: {
            settings: GObject.ParamSpec.object('settings', '', '', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, Gio.Settings),
        },
    },
    class PrefsDialog extends Gtk.Dialog {
        _init(params) {
            super._init(params);

            this.get_content_area().add(new PrefsWidget({
                settings: this.settings,
            }));
        }
    }
);

const Application = GObject.registerClass(
    class Application extends Gtk.Application {
        _init(params) {
            super._init(params);

            this.decorated = true;

            this.add_main_option(
                'undecorated', 0, GLib.OptionFlags.NONE, GLib.OptionArg.NONE, 'Hide window decorations', null
            );

            this.connect('startup', this.startup.bind(this));
            this.connect('activate', this.activate.bind(this));
            this.connect('handle-local-options', this.handle_local_options.bind(this));
        }

        startup() {
            simple_action(this, 'quit', this.quit.bind(this));

            this.settings = get_settings();

            const menus = Gtk.Builder.new_from_file(APP_DATA_DIR.get_child('menus.ui').get_path());

            this.window = new AppWindow({
                application: this,
                decorated: this.decorated,
                menus,
            });

            this.add_action(this.window.toggle_action);

            this.prefs_dialog = new PrefsDialog({
                transient_for: this.window,
                settings: this.settings,
            });

            this.prefs_dialog.connect('delete-event', () => this.prefs_dialog.hide_on_delete());

            simple_action(this, 'preferences', this.preferences.bind(this));

            const gtk_settings = Gtk.Settings.get_default();
            gtk_settings.gtk_application_prefer_dark_theme = true;

            this.settings.connect('changed', this.setup_shortcuts.bind(this));
            this.setup_shortcuts();
        }

        activate() {
            this.window.show();
        }

        handle_local_options(_, options) {
            if (options.contains('undecorated'))
                this.decorated = false;

            return -1;
        }

        preferences() {
            this.prefs_dialog.show();
        }

        quit() {
            super.quit();
        }

        setup_shortcut(key, action) {
            this.set_accels_for_action(action, this.settings.get_strv(key));
        }

        setup_shortcuts() {
            this.setup_shortcut('shortcut-terminal-copy', 'terminal.copy');
            this.setup_shortcut('shortcut-terminal-copy-html', 'terminal.copy-html');
            this.setup_shortcut('shortcut-terminal-paste', 'terminal.paste');
            this.setup_shortcut('shortcut-terminal-select-all', 'terminal.select-all');
            this.setup_shortcut('shortcut-win-new-tab', 'win.new-tab');
            this.setup_shortcut('shortcut-page-close', 'page.close');

            for (let i = 0; i < 10; i += 1)
                this.setup_shortcut(`shortcut-select-tab-${i + 1}`, `win.select-tab(${i})`);
        }
    }
);

GLib.set_prgname('com.github.amezin.ddterm');
Gdk.set_allowed_backends('x11');

const app = new Application({
    application_id: 'com.github.amezin.ddterm',
    flags: Gio.ApplicationFlags.ALLOW_REPLACEMENT,
});
app.run([System.programInvocationName].concat(ARGV));
