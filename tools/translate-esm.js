#!/usr/bin/env gjs

/*
    Copyright © 2024 Aleksandr Mezin

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

const { GLib, Gio } = imports.gi;

const System = imports.system;

class AstError extends Error {
    constructor(message, node) {
        if (node?.loc) {
            const file = node.loc.source;
            const line = node.loc.start.line;
            const column = node.loc.start.column;

            super(`${file}:${line}:${column}: error: ${message}`);
        } else {
            super(message);
        }

        this.name = 'AstError';
    }
}

function translate(file, root_url, replace_imports) {
    const [, bytes] = file.load_contents(null);
    const text = globalThis.TextDecoder
        ? new TextDecoder().decode(bytes)
        : imports.byteArray.toString(bytes);

    const base_uri = file.get_uri();
    const base_uri_parsed = GLib.Uri.parse(base_uri, GLib.UriFlags.NONE);

    const line_start = [];
    let line_end = -1;

    do {
        line_start.push(line_end + 1);
        line_end = text.indexOf('\n', line_end + 1);
    } while (line_end !== -1);

    const position_to_index = ({ line, column }) => line_start[line - 1] + column;

    const ast = Reflect.parse(text, { target: 'module', source: file.get_path() });
    const translated = [];
    let last_index = 0;

    function translate_path(path, prefix, new_prefix, node) {
        const path_parts = path.split('/');
        const prefix_parts = prefix.split('/');

        if (path_parts[path_parts.length - 1] === '')
            path_parts.pop();

        if (prefix_parts[prefix_parts.length - 1] === '')
            prefix_parts.pop();

        for (let i = 0; i < prefix_parts.length; i++) {
            if (path_parts[i] !== prefix_parts[i])
                throw new AstError(`${path} should start with ${prefix}`, node);
        }

        path_parts[path_parts.length - 1] =
            path_parts[path_parts.length - 1].replace(/\.js$/, '');

        return [new_prefix, ...path_parts.slice(prefix_parts.length)].join('.');
    }

    function translate_module_url(module_url, node) {
        if (replace_imports[module_url])
            return replace_imports[module_url];

        if (['gettext', 'system'].includes(module_url))
            return `imports.${module_url}`;

        const module_uri_parsed =
            base_uri_parsed.parse_relative(module_url, GLib.UriFlags.NON_DNS);

        switch (module_uri_parsed.get_scheme()) {
        case 'gi':
            if (module_uri_parsed.get_host() === 'Mtk')
                return 'imports.gi.Meta';

            return `imports.gi.${module_uri_parsed.get_host()}`;

        case 'resource':
            return translate_path(
                module_uri_parsed.get_path(),
                '/org/gnome/shell',
                'imports',
                node
            );

        case 'file':
            return translate_path(
                module_uri_parsed.get_path(),
                root_url.get_path(),
                'Me.imports',
                node
            );

        default:
            throw new AstError(
                `Unhandled scheme: ${module_uri_parsed.get_scheme()} in ${module_url}`,
                node
            );
        }
    }

    let has_current_extension = false;

    function translate_import(node) {
        let rhs = translate_module_url(node.moduleRequest.source.value);

        if (!rhs)
            return;

        const lines = [];

        if (rhs.startsWith('Me.') && !has_current_extension) {
            lines.push('const Me = imports.misc.extensionUtils.getCurrentExtension();');
            has_current_extension = true;
        }

        const members = [];

        for (const specifier of node.specifiers) {
            const err_node = specifier.loc ? specifier : node;

            if (specifier.name.type !== 'Identifier')
                throw new AstError('Expected identifier as import name', err_node);

            const name = specifier.name.name;

            switch (specifier.type) {
            case 'ImportNamespaceSpecifier':
                lines.push(`const ${name} = ${rhs};`);
                break;

            case 'ImportSpecifier':
                if (specifier.id.type !== 'Identifier')
                    throw new AstError('Expected identifier as import id', err_node);

                if (specifier.id.name === 'default') {
                    lines.push(`const ${name} = ${rhs};`);
                } else if (specifier.id.name === name) {
                    const space_pre = text.substring(
                        position_to_index(node.loc.start),
                        position_to_index(specifier.loc.start)
                    ).match(/\s*$/);

                    const space_post = text.substring(
                        position_to_index(specifier.loc.end),
                        position_to_index(node.loc.end)
                    ).match(/^\s*/);

                    members.push([space_pre, name, space_post].join(''));
                } else {
                    lines.push(`const ${name} = ${rhs}.${specifier.id.name};`);
                }

                break;

            default:
                throw new AstError(`Unknown import specifier type: ${specifier.type}`, err_node);
            }
        }

        if (members.length > 0)
            lines.push(`const {${members.join(',')}} = ${rhs};`);

        translated.push(lines.join('\n'));
    }

    function translate_export(node) {
        switch (node.declaration.type) {
        case 'FunctionDeclaration':
            translated.push(text.substring(
                position_to_index(node.loc.start),
                position_to_index(node.declaration.loc.start)
            ).replace(/\b\s*export\s*\b/, ''));

            translated.push(text.substring(
                position_to_index(node.declaration.loc.start),
                position_to_index(node.loc.end)
            ));

            translated.push(`\n\n/* exported ${node.declaration.id.name} */`);

            break;

        case 'VariableDeclaration':
            for (const declaration of node.declaration.declarations) {
                const body = text.substring(
                    position_to_index(declaration.init.loc.start),
                    position_to_index(declaration.init.loc.end)
                );

                translated.push(`var ${declaration.id.name} = ${body};`);
            }

            translated.push(
                `\n\n/* exported ${node.declaration.declarations.map(d => d.id.name).join(' ')} */`
            );

            break;

        case 'ClassStatement': {
            const body = text.substring(
                position_to_index(node.declaration.loc.start),
                position_to_index(node.declaration.loc.end)
            );

            translated.push(`var ${node.declaration.id.name} = ${body};`);
            translated.push(`\n\n/* exported ${node.declaration.id.name} */`);

            break;
        }
        default:
            throw new AstError(`Unknown declration type: ${node.declaration.type}`, node);
        }
    }

    let strict = false;

    for (const node of ast.body) {
        translated.push(text.substring(last_index, position_to_index(node.loc.start)));

        if (!strict) {
            translated.push("'use strict';\n\n");
            strict = true;
        }

        switch (node.type) {
        case 'ImportDeclaration':
            translate_import(node);
            break;

        case 'ExportDeclaration':
            translate_export(node);
            break;

        default:
            translated.push(text.substring(
                position_to_index(node.loc.start),
                position_to_index(node.loc.end)
            ));
        }

        last_index = position_to_index(node.loc.end);
    }

    translated.push(text.substring(last_index));
    return translated.join('');
}

const app = Gio.Application.new(null, 0);

app.add_main_option(
    GLib.OPTION_REMAINING,
    0,
    GLib.OptionFlags.NONE,
    GLib.OptionArg.STRING_ARRAY,
    'Input files',
    'INPUT_FILE'
);

app.add_main_option(
    'output',
    'o'.charCodeAt(0),
    GLib.OptionFlags.NONE,
    GLib.OptionArg.STRING,
    'Output file',
    'PATH'
);

app.add_main_option(
    'base-dir',
    'd'.charCodeAt(0),
    GLib.OptionFlags.NONE,
    GLib.OptionArg.STRING,
    'Base/root directory path',
    'PATH'
);

app.add_main_option(
    'replace-import',
    'r'.charCodeAt(0),
    GLib.OptionFlags.NONE,
    GLib.OptionArg.STRING_ARRAY,
    'Replace the specified URL with specified legacy import, separated with colon',
    'URL:IMPORT'
);

app.connect('handle-local-options', (_, options) => {
    const files = options.lookup(GLib.OPTION_REMAINING, 'as', true);

    if (files.length === 0) {
        printerr('No input file specified');
        return 1;
    }

    if (files.length > 1) {
        printerr('Only one input file must be specified');
        return 1;
    }

    const input_file = Gio.File.new_for_commandline_arg(files[0]);

    try {
        const base_dir = GLib.canonicalize_filename(options.lookup('base-dir', 's') ?? '.', null);
        const base_uri = GLib.Uri.parse(GLib.filename_to_uri(base_dir, null), GLib.UriFlags.NONE);

        const replace_imports_args = options.lookup('replace-import', 'as', true) ?? [];
        const replace_imports = Object.fromEntries(replace_imports_args.map(arg => {
            const split_pos = arg.lastIndexOf(':');

            return [arg.substring(0, split_pos), arg.substring(split_pos + 1)];
        }));

        const translated = translate(input_file, base_uri, replace_imports);
        const output_path = options.lookup('output', 's');

        if (output_path) {
            Gio.File.new_for_commandline_arg(output_path).replace_contents(
                translated,
                null,
                false,
                Gio.FileCreateFlags.NONE,
                null
            );
        } else {
            print(translated);
        }

        return 0;
    } catch (ex) {
        if (ex instanceof AstError)
            printerr(ex.message);
        else
            logError(ex);

        return 1;
    }
});

System.exit(app.run([System.programInvocationName].concat(ARGV)));
