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

'use strict';

const ByteArray = imports.byteArray;

const { GLib, GObject, Gio, Gtk } = imports.gi;

function is_file_object(value) {
    // `<string> instanceof Gio.File` causes a crash!
    return value instanceof GObject.Object && value instanceof Gio.File;
}

class Cache extends Map {
    constructor(base_uri) {
        super();
        this.base_uri = base_uri;
    }

    get_uri(key) {
        if (is_file_object(key))
            return key.get_uri();

        return GLib.Uri.resolve_relative(this.base_uri, key, GLib.UriFlags.NONE);
    }

    get_file(key) {
        if (is_file_object(key))
            return key;

        return Gio.File.new_for_uri(this.get_uri(key));
    }

    get(key) {
        const uri = this.get_uri(key);

        const cached = super.get(uri);
        if (cached !== undefined)
            return cached;

        const loaded = this.load(this.get_file(key));
        super.set(uri, loaded);
        return loaded;
    }

    has(key) {
        return super.has(this.get_uri(key));
    }

    set(key, value) {
        return super.set(this.get_uri(key), value);
    }

    delete(key) {
        return super.delete(this.get_uri(key));
    }
}

class BinaryCache extends Cache {
    load(file) {
        const [ok_, contents] = file.load_contents(null);
        return contents;
    }
}

class BinaryCacheWrapper extends Cache {
    constructor(binary_cache, base_uri = null) {
        super(base_uri ?? binary_cache.base_uri);
        this.binary_cache = binary_cache;
    }
}

class CssProviderCache extends BinaryCacheWrapper {
    load(file) {
        const loaded = Gtk.CssProvider.new();
        loaded.load_from_data(this.binary_cache.get(file));
        return loaded;
    }
}

class TextCache extends BinaryCacheWrapper {
    load(file) {
        return ByteArray.toString(this.binary_cache.get(file));
    }
}

class TextCacheWrapper extends Cache {
    constructor(text_cache, base_uri = null) {
        super(base_uri ?? text_cache.base_uri);
        this.text_cache = text_cache;
    }
}

class GtkBuilderCache extends TextCacheWrapper {
    load(file) {
        return Gtk.Builder.new_from_string(this.text_cache.get(file), -1);
    }
}

class DBusInterfaceInfoCache extends TextCacheWrapper {
    load(file) {
        return Gio.DBusInterfaceInfo.new_for_xml(this.text_cache.get(file));
    }
}

var Resources = GObject.registerClass(
    {
        Properties: {
            'base-uri': GObject.ParamSpec.string(
                'base-uri',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                null
            ),
        },
    },
    class DDTermAppResources extends GObject.Object {
        _init(params) {
            super._init(params);

            this.binary_files = new BinaryCache(this.base_uri);
            this.css_providers = new CssProviderCache(this.binary_files);
            this.text_files = new TextCache(this.binary_files);
            this.gtk_builders = new GtkBuilderCache(this.text_files);
            this.dbus_interfaces = new DBusInterfaceInfoCache(this.text_files);
        }

        get menus() {
            return this.gtk_builders.get('ddterm/app/menus.ui');
        }

        get_file(key) {
            return this.binary_files.get_file(key);
        }
    }
);

/* exported Resources */
