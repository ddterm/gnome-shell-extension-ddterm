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
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageList from 'resource:///org/gnome/shell/ui/messageList.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

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

    show() {
        this.source.showNotification(this);
    }
});

class NotificationSlot {
    constructor(source_factory) {
        this._source_factory = source_factory;
        this._notification = null;
    }

    create(banner, title, params) {
        this._notification?.destroy(MessageTray.NotificationDestroyedReason.REPLACED);

        const source = this._source_factory.create_source();

        this._notification = new Notification(source, title ?? source.title, banner, params);
        this._notification.connect('destroy', () => {
            this._notification = null;
        });

        return this._notification;
    }
}

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
        this._version_mismatch_notification = new NotificationSlot(this);
        this._error_notification = new NotificationSlot(this);
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
        this._version_mismatch_notification.create(
            this.gettext_context.gettext(
                'Warning: ddterm version has changed. ' +
                'Log out, then log in again to load the updated extension.'
            )
        ).show();
    }

    create_error(message, params) {
        const notification = this._error_notification.create(message, null, params);
        notification.setUrgency(MessageTray.Urgency.CRITICAL);
        return notification;
    }

    show_error(message, trace) {
        if (message instanceof Error || message instanceof GLib.Error)
            message = message.message;

        message = `${message}`;

        if (!trace?.trim()) {
            this.create_error(message).show();
            return;
        }

        const notification = this.create_error(
            [
                `<b>${GLib.markup_escape_text(message, -1)}</b>`,
                '',
                GLib.markup_escape_text(trace, -1),
            ].join('\n'),
            { bannerMarkup: true }
        );

        notification.addAction(
            this.gettext_context.gettext('Copy to Clipboard'),
            () => St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, trace)
        );

        notification.show();
    }

    destroy() {
        this._source?.destroy(MessageTray.NotificationDestroyedReason.SOURCE_CLOSED);
    }
});
