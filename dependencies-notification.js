#!/usr/bin/env gjs

/*
    Copyright © 2022 Aleksandr Mezin

    This file is part of ddterm GNOME Shell extension.

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

'use strict';

const System = imports.system;

const { GLib, GObject, Gio } = imports.gi;

const APP_DATA_DIR = Gio.File.new_for_commandline_arg(System.programInvocationName).get_parent();
imports.searchPath.unshift(APP_DATA_DIR.get_path());

const { translations } = imports;
translations.init(APP_DATA_DIR);

const NOTIFICATIONS_INTERFACE_XML = `
<node>
  <interface name="org.freedesktop.Notifications">
    <method name="Notify">
      <arg type="s" direction="in" name="app_name"/>
      <arg type="u" direction="in" name="replaces_id"/>
      <arg type="s" direction="in" name="app_icon"/>
      <arg type="s" direction="in" name="summary"/>
      <arg type="s" direction="in" name="body"/>
      <arg type="as" direction="in" name="actions"/>
      <arg type="a{sv}" direction="in" name="hints"/>
      <arg type="i" direction="in" name="expire_timeout"/>
      <arg type="u" direction="out" name="id"/>
    </method>
    <method name="CloseNotification">
      <arg type="u" direction="in" name="id"/>
    </method>
    <signal name="NotificationClosed">
      <arg type="u" name="id"/>
      <arg type="u" name="reason"/>
    </signal>
    <signal name="ActionInvoked">
      <arg type="u" name="id"/>
      <arg type="s" name="action_key"/>
    </signal>
  </interface>
</node>
`;

const NotificationsProxy = Gio.DBusProxy.makeProxyWrapper(NOTIFICATIONS_INTERFACE_XML);

const Application = GObject.registerClass(
    class DDTermPackageKitApplication extends Gio.Application {
        _init(params) {
            super._init(params);

            this.add_main_option(
                'package',
                0,
                GLib.OptionFlags.NONE,
                GLib.OptionArg.STRING_ARRAY,
                'Request package to be installed',
                'PACKAGE_NAME'
            );

            this.add_main_option(
                'file',
                0,
                GLib.OptionFlags.NONE,
                GLib.OptionArg.STRING_ARRAY,
                'Request file to be installed',
                'FILENAME'
            );

            GLib.set_application_name('Drop Down Terminal');

            this.notification_id = 0;

            this.connect('handle-local-options', this.handle_local_options.bind(this));
            this.connect('startup', this.startup.bind(this));
            this.connect('activate', this.activate.bind(this));
            this.connect('shutdown', this.shutdown.bind(this));
        }

        handle_local_options(_, options) {
            function get_array_option(key) {
                const variant_value =
                    options.lookup_value(key, GLib.VariantType.new('as'));

                const unpacked = variant_value ? variant_value.deepUnpack() : [];

                return Array.from(new Set(unpacked)).sort();
            }

            this.packages = get_array_option('package');
            this.files = get_array_option('file');

            return -1;
        }

        startup() {
            this.notifications_proxy = NotificationsProxy(
                this.get_dbus_connection(),
                'org.freedesktop.Notifications',
                '/org/freedesktop/Notifications'
            );

            this.notifications_proxy.connectSignal(
                'NotificationClosed',
                (proxy, owner, args) => {
                    const [notification_id] = args;
                    this.notification_closed(notification_id);
                }
            );
        }

        activate() {
            if (this.notification_id)
                return;

            const message_lines = [
                translations.gettext('ddterm needs additional packages to run.'),
            ];

            if (this.packages.length > 0) {
                message_lines.push(
                    translations.gettext('Please install the following packages:'),
                    ...this.packages.map(v => `- ${v}`)
                );
            }

            if (this.files.length > 0) {
                message_lines.push(
                    translations.gettext(
                        'Please install packages that provide the following files:'
                    ),
                    ...this.files.map(v => `- ${v}`)
                );
            }

            const message_body = message_lines.join('\n');
            printerr(message_body);

            [this.notification_id] = this.notifications_proxy.NotifySync(
                GLib.get_application_name(),
                0,
                '',
                translations.gettext('Missing dependencies'),
                message_body,
                [],
                [],
                -1
            );

            if (this.notification_id)
                this.hold();
        }

        notification_closed(notification_id) {
            if (this.notification_id !== notification_id)
                return;

            this.notification_id = 0;
            this.release();
        }

        shutdown() {
            const notification_id = this.notification_id;

            if (!notification_id)
                return;

            this.notification_closed(notification_id); // changes this.notification_id!
            this.notifications_proxy.CloseNotificationSync(notification_id);
        }
    }
);

const app = new Application({
    application_id: 'com.github.amezin.ddterm.packagekit',
    flags: Gio.ApplicationFlags.ALLOW_REPLACEMENT | Gio.ApplicationFlags.REPLACE,
});

System.exit(app.run([System.programInvocationName].concat(ARGV)));
