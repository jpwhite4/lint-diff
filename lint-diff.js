#!/usr/bin/env node

var diff = require('diff');
var colors = require('colors');

var compare = function(a, b) {
    switch (typeof a) {
    case 'string':
        return a.localeCompare(b);
    case 'number':
        if (a < b) {
            return -1;
        } else if ( a > b ) {
            return 1;
        } else {
            return 0;
        }
    default:
        throw new Error('Unsupported datatype');
    }
};

var process_lintfile = function(filename) {

    var i, file;
    var fs = require('fs');
    var report = JSON.parse(fs.readFileSync(filename));
    var message;
    var output = {
        report: {
            messages: []
        },
        messages: []
    };

    if (report.files && report.files) {
        // phpcs mode
        for (file in report.files) {
            if (report.files.hasOwnProperty(file)) {
                output.report.file = file;
                for (i = 0; i < report.files[file].messages.length; i++) {
                    message = report.files[file].messages[i];
                    output.report.messages.push({
                        line: message.line,
                        column: message.column,
                        type: message.type.toLocaleLowerCase(),
                        message: message.message
                    });
                    output.messages.push(message.type + message.severity + message.source + message.message);
                }
            }
            return output;
        }
    } else {
        // eslint mode
        output.report.file = report[0].filePath;
        // eslint does not return the json errors in a deterministic order
        // so sort the errors before processing.
        var comparison = function(a, b) {
            var properties = ['line', 'column', 'severity', 'message'];
            var i, result = 0;
            for (i = 0; result === 0 && i < properties.length; i++) {
                result = compare(a[properties[i]],  b[properties[i]]);
            }
            return result;
        };

        report[0].messages.sort(comparison);

        for (i = 0; i < report[0].messages.length; i++) {
            message = report[0].messages[i];
            output.report.messages.push({
                line: message.line,
                column: message.column,
                type: message.severity > 1 ? 'error' : 'warning',
                message: message.message + ' (' + message.ruleId + ')'
            });
            output.messages.push(message.ruleId + message.severity + message.source + message.message);
        }
        return output;
    }

    return null;
};

var Countalizer = function() {
    var counts = {error: 0, warning: 0};

    return {
        serialize: function(prefix) {

            var total = counts.error + counts.warning;

            var english_plural = function(val, word) {
                if (val == 1) {
                    return val + ' ' + word;
                }
                return val + ' ' + word + 's';
            };

            var outstr = english_plural(total, prefix + ' problem');
            if (total > 0) {
                outstr += ' (' + english_plural(counts.error, 'error') + ') (' + english_plural(counts.warning, 'warning') + ')';
            }
            return outstr;
        },
        toString: function() {
            return this.serialize('', false);
        },
        add: function(type) {
            if (type == 'error') {
                counts.error += 1;
            } else {
                counts.warning += 1;
            }
        }
    };
};

var padding = function(word, colwidth) {
    return word + ' '.repeat(Math.max(0, colwidth - word.length));
};

var format_message = function(message, highlight) {
    var format_type = function(type) {
        var outstr;
        if (highlight) {
            outstr = 'NEW ' + padding(type.toLocaleUpperCase(), 8);
            if(process.stdout.isTTY) {
                if (type == 'error' ) {
                    return colors.red(outstr);
                } else {
                    return colors.yellow(outstr);
                }
            }
            return outstr;
        }
        return '    ' + padding(type, 8);
    };
    return padding(message.line + ':' + message.column, 8) + ' ' + format_type(message.type) + ' ' + message.message + '\n';
};

var report1 = process_lintfile(process.argv[2]);
var report2 = process_lintfile(process.argv[3]);

var differences = diff.diffArrays(report1.messages, report2.messages);

var outstr = report2.report.file + '\n';

var newcounts = new Countalizer();
var existingcounts = new Countalizer();

var exitcode = 0;
var i, j = 0, k;
for (i = 0; i < differences.length; i++) {
    if (differences[i].added) {
        exitcode = 1;
        for (k = 0; k < differences[i].count; k++) {
            outstr += format_message(report2.report.messages[j], true);
            newcounts.add(report2.report.messages[j].type);
            j++;
        }
    } else if (differences[i].removed) {
        // do nothing
    } else {
        for (k = 0; k < differences[i].count; k++) {
            outstr += format_message(report2.report.messages[j], false);
            existingcounts.add(report2.report.messages[j].type);
            j++;
        }
    }
}

if (exitcode) {
    process.stdout.write(outstr);
    if (process.stdout.isTTY) {
        process.stdout.write('\n' + colors.yellow(existingcounts.serialize('old')) + '\n');
        process.stdout.write(colors.red(newcounts.serialize('new') + '\n'));
    } else {
        process.stdout.write('\n' + existingcounts.serialize('old') + '\n');
        process.stdout.write(newcounts.serialize('new') + '\n');
    }
}
process.exit(exitcode);
