'use strict';

/* exported init buildPrefsWidget createPrefsWidgetClass */

const { GObject, Gio, Gtk } = imports.gi;

function createPrefsWidgetClass(resource_path) {
    return GObject.registerClass(
        {
            Template: resource_path.get_child('prefs.ui').get_uri(),
            Children: ['font_chooser', 'opacity_adjustment', 'height_adjustment'],
            Properties: {
                settings: GObject.ParamSpec.object('settings', '', '', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, Gio.Settings),
            },
        },
        class PrefsWidget extends Gtk.Grid {
            _init(params) {
                super._init(params);

                this.settings.bind('font', this.font_chooser, 'font', Gio.SettingsBindFlags.DEFAULT);
                this.settings.bind('background-opacity', this.opacity_adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
                this.settings.bind('window-height', this.height_adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
            }
        }
    );
}

function init() {}

let prefsWidgetClass = null;

function buildPrefsWidget() {
    const Me = imports.misc.extensionUtils.getCurrentExtension();

    if (prefsWidgetClass === null)
        prefsWidgetClass = createPrefsWidgetClass(Me.dir);

    const settings = imports.misc.extensionUtils.getSettings();

    const widget = new prefsWidgetClass({
        settings,
    });

    widget.connect('destroy', () => settings.run_dispose());

    return widget;
}
