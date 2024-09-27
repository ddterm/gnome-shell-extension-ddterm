import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';

import { connect, connect_after, get_main, get_resource_content } from './util.js';

const Interface = GObject.registerClass({
    Properties: Object.fromEntries([
        ...[
            'window-position',
            'window-monitor',
            'window-monitor-connector',
            'show-animation',
            'hide-animation',
        ].map(
            name => [
                name,
                GObject.ParamSpec.string(
                    name,
                    '',
                    '',
                    GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                    ''
                ),
            ]
        ),
        ...[
            'force-x11-gdk-backend',
            'window-maximize',
            'override-window-animation',
            'window-above',
            'hide-when-focus-lost',
            'window-stick',
            'window-skip-taskbar',
        ].map(
            name => [
                name,
                GObject.ParamSpec.boolean(
                    name,
                    '',
                    '',
                    GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                    false
                ),
            ]
        ),
        [
            'window-size',
            GObject.ParamSpec.double(
                'window-size',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                0,
                1,
                0.6
            ),
        ],
        [
            'settings',
            GObject.ParamSpec.object(
                'settings',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                Gio.Settings
            ),
        ],
    ]),
}, class DDTermSettingsHookInterface extends GObject.Object {
    _init(params) {
        super._init(params);

        this._destroy_callbacks = [];

        if (GObject.signal_lookup('shutdown', Shell.Global)) {
            this._destroy_callbacks.push(
                connect(global, 'shutdown', () => this.Destroy())
            );
        }

        this.wrapper = Gio.DBusExportedObject.wrapJSObject(
            get_resource_content('./dbus-interfaces/com.github.amezin.ddterm.Settings.xml'),
            this
        );

        for (const property_info of this.wrapper.get_info().properties) {
            const { name, signature } = property_info;

            this.connect(`notify::${name}`, () => {
                let value = this[name];

                if (!(value instanceof GLib.Variant) || value.get_type_string() !== signature)
                    value = new GLib.Variant(signature, value);

                this.wrapper.emit_property_changed(name, value);
            });

            this.settings.bind(name, this, name, Gio.SettingsBindFlags.NO_SENSITIVITY);
            this._destroy_callbacks.push(() => Gio.Settings.unbind(this, name));

            this.notify(name);
        }

        this.wrapper.export(Gio.DBus.session, '/org/gnome/Shell/Extensions/ddterm/TestHook');
        this._destroy_callbacks.push(() => this.wrapper.unexport());

        this._destroy_callbacks.push(
            connect_after(this.settings, 'change-event', () => {
                this.wrapper.flush();

                return false;
            })
        );

        this.wrapper.flush();
    }

    Destroy() {
        while (this._destroy_callbacks.length)
            this._destroy_callbacks.pop()();
    }
});

export async function init() {
    try {
        const main = await get_main();
        const { settings } =
            main.extensionManager.lookup('ddterm@amezin.github.com').stateObj.enabled_state;

        new Interface({ settings });
    } catch (ex) {
        logError(ex);
        throw ex;
    }
}
