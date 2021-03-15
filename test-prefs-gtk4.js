'use strict';

imports.gi.versions.Gdk = '4.0';
imports.gi.versions.Gtk = '4.0';

const System = imports.system;
const { GObject, Gio, Gtk } = imports.gi;

const APP_DATA_DIR = Gio.File.new_for_commandline_arg(System.programInvocationName).get_parent();

imports.searchPath.unshift(APP_DATA_DIR.get_path());

const { util } = imports;

util.APP_DATA_DIR = APP_DATA_DIR;

const PrefsWidget = imports.prefs.createPrefsWidgetClass(util.APP_DATA_DIR, util);

var PrefsDialog = GObject.registerClass(
    {
        Properties: {
            settings: GObject.ParamSpec.object('settings', '', '', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, Gio.Settings),
        },
    },
    class PrefsDialog extends Gtk.Dialog {
        _init(params) {
            super._init(params);

            this.get_content_area().append(new PrefsWidget({
                settings: this.settings,
            }));
        }
    }
);

const Application = GObject.registerClass(
    class Application extends Gtk.Application {
        _init(params) {
            super._init(params);

            this.connect('startup', this.startup.bind(this));
            this.connect('activate', this.activate.bind(this));
        }

        startup() {
            const settings_source = Gio.SettingsSchemaSource.new_from_directory(
                APP_DATA_DIR.get_child('schemas').get_path(),
                Gio.SettingsSchemaSource.get_default(),
                false
            );

            this.settings = new Gio.Settings({
                settings_schema: settings_source.lookup('com.github.amezin.ddterm', true),
            });
        }

        activate() {
            this.preferences();
        }

        preferences() {
            const prefs_dialog = new PrefsDialog({
                settings: this.settings,
                application: this,
            });

            prefs_dialog.show();
        }
    }
);

const app = new Application();
app.run([System.programInvocationName].concat(ARGV));
