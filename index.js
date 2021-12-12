const si = require('systeminformation');
const chalk = require('chalk');
const boxen = require('boxen');
const pad = require('pad')
const pjson = require('./package.json');

const data = [];

data.push({ label: pjson.name, info: pjson.version });
data.push({ label: 'node', info: process.version });
data.push({ label: 'Platform', info: process.platform });

printBox(data, "Basic Info");
// console.log(process)

si.mem().then(data => console.log(data.total / 1024 / 1024 / 1024)).catch(error => console.error(error));

// si.cpu() .then(data => console.log(data)) .catch(error => console.error(error));

function printBox(dt, title) {
    let largestLabelSize = 0;
    dt.forEach(el => {
        if (el.label.length > largestLabelSize) {
            largestLabelSize = el.label.length;
        }
    });

    const str = dt.reduce((prev, el) => prev + (prev && '\n') + info(pad(el.label, largestLabelSize), el.info), "");
    console.log(boxen(str, { title, padding: 1, margin: 1 },));
}

function info(label, info) {
    return label + ": " + chalk.green(info);
}