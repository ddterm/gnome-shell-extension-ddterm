const fs = require('fs');
const path = require('path/posix');

exports.interfaceVersion = 2;

exports.resolve = function (source, file) {
    if (source.startsWith('resource:') || source.startsWith('gi:'))
        return { found: true, path: null };

    const basedir = path.dirname(path.resolve(file));
    const resolved = path.resolve(basedir, source);

    if (fs.existsSync(resolved))
        return { found: true, path: resolved };
    else
        return { found: false };
};
