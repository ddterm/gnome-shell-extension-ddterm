'use strict';

/* exported PrefsDialog */

const { GObject, Gio, Gtk } = imports.gi;
const { util } = imports;

const PrefsWidget = imports.prefs.createPrefsWidgetClass(util.APP_DATA_DIR, util);

var PrefsDialog = GObject.registerClass(
    {
        Template: util.APP_DATA_DIR.get_child('prefsdialog.ui').get_uri(),
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

Object.assign(PrefsDialog.prototype, util.UtilMixin);
