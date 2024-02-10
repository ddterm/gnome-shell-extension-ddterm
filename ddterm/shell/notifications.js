/*
    Copyright © 2023 Aleksandr Mezin

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

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageList from 'resource:///org/gnome/shell/ui/messageList.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import { find_package_installer } from './packagemanager.js';

const Banner = GObject.registerClass({
}, class DDTermNotificationBanner extends MessageTray.NotificationBanner {
    _init(notification) {
        super._init(notification);

        const expand_label = new MessageList.URLHighlighter(
            notification.bannerBodyText,
            true,
            notification.bannerBodyMarkup
        );

        expand_label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;

        const scroll_area = new St.ScrollView({
            style_class: 'vfade',
            overlay_scrollbars: true,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            visible: this.expanded,
        });

        const viewport = new St.BoxLayout({ vertical: true });

        viewport.add_actor(expand_label);
        scroll_area.add_actor(viewport);
        this.setExpandedBody(scroll_area);
        this.setExpandedLines(12);  /* like in Telepathy notifications */

        const disconnect = () => {
            this.disconnect(destroy_banner_handler);
            notification.disconnect(destroy_notification_handler);
            notification.disconnect(update_handler);
        };

        const destroy_banner_handler = this.connect('destroy', disconnect);
        const destroy_notification_handler = notification.connect('destroy', disconnect);
        const update_handler = notification.connect('updated', () => {
            expand_label.setMarkup(notification.bannerBodyText, notification.bannerBodyMarkup);
        });
    }
});

const Notification = GObject.registerClass({
}, class DDTermNotification extends MessageTray.Notification {
    createBanner() {
        return new Banner(this);
    }
});

const VersionMismatchNotification = GObject.registerClass({
}, class DDTermVersionMismatchNotification extends Notification {
    _init(source, gettext_context) {
        const banner = gettext_context.gettext(
            'Warning: ddterm version has changed. ' +
            'Log out, then log in again to load the updated extension.'
        );

        super._init(source, source.title, banner);
    }
});

const ErrorNotification = GObject.registerClass({
}, class DDTermErrorNotification extends Notification {
    _init(source, message, trace, gettext_context) {
        if (message instanceof Error || message instanceof GLib.Error)
            message = message.message;

        if (trace instanceof Error || trace instanceof GLib.Error)
            trace = trace.message;

        message = `${message}`;

        if (!trace?.trim()) {
            super._init(source, source.title, message);
            return;
        }

        const plain = [message, '', trace].join('\n');
        const markup = [
            `<b>${GLib.markup_escape_text(message, -1)}</b>`,
            '',
            GLib.markup_escape_text(trace, -1),
        ].join('\n');

        super._init(source, source.title, markup, { bannerMarkup: true });

        this.addAction(
            gettext_context.gettext('Copy to Clipboard'),
            () => St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, plain)
        );
    }
});

const MissingDependenciesNotification = GObject.registerClass({
}, class DDTermMissingDependenciesNotification extends Notification {
    _init(source, packages, files, app_id, gettext_context) {
        const lines = [
            gettext_context.gettext('ddterm needs additional packages to run.'),
        ];

        if (packages.length > 0) {
            lines.push(
                gettext_context.gettext('Please install the following packages:'),
                packages.join(' ')
            );
        }

        if (files.length > 0) {
            lines.push(
                gettext_context.gettext(
                    'Please install packages that provide the following files:'
                ),
                files.join(' ')
            );
        }

        super._init(source, source.title, lines.join('\n'));

        if (packages.length === 0)
            return;

        const cancellable = new Gio.Cancellable();

        this.connect('destroy', () => {
            cancellable.cancel();
        });

        find_package_installer(cancellable).then(installer => {
            this.addAction(gettext_context.gettext('Install'), () => {
                installer(packages, app_id);
            });

            this.update(this.title, this.bannerBodyText, {});
        });
    }
});

export const Notifications = GObject.registerClass({
    Properties: {
        'gettext-context': GObject.ParamSpec.jsobject(
            'gettext-context',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY
        ),
    },
}, class DDTermNotifications extends GObject.Object {
    _init(params) {
        super._init(params);

        this._source = null;
    }

    create_source() {
        if (this._source)
            return this._source;

        this._source =
            new MessageTray.Source(this.gettext_context.gettext('ddterm'), 'utilities-terminal');

        this._source.connect('destroy', () => {
            this._source = null;
        });

        Main.messageTray.add(this._source);
        return this._source;
    }

    show_version_mismatch() {
        const source = this.create_source();
        const notification = new VersionMismatchNotification(source, this.gettext_context);
        source.showNotification(notification);
    }

    show_error(message, trace) {
        const source = this.create_source();

        if (source.notifications.some(n => n instanceof MissingDependenciesNotification))
            return;

        const notification = new ErrorNotification(source, message, trace, this.gettext_context);

        source.notifications.filter(n => n instanceof VersionMismatchNotification).forEach(n => {
            n.setUrgency(MessageTray.Urgency.CRITICAL);
        });

        notification.setUrgency(MessageTray.Urgency.CRITICAL);
        source.showNotification(notification);
    }

    show_missing_dependencies(packages, files, app_id) {
        const source = this.create_source();
        const notification = new MissingDependenciesNotification(
            source,
            packages,
            files,
            app_id,
            this.gettext_context
        );

        notification.setUrgency(MessageTray.Urgency.CRITICAL);
        notification.setForFeedback(true);
        source.showNotification(notification);
    }

    destroy(reason = MessageTray.NotificationDestroyedReason.SOURCE_CLOSED) {
        this._source?.destroy(reason);
    }
});
