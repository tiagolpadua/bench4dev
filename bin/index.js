#!/usr/bin/env node

const si = require('systeminformation');
const chalk = require('chalk');
const boxen = require('boxen');
const pad = require('pad')
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require("child_process");
const cliSpinners = require('cli-spinners');
const rimraf = require('rimraf');
const logUpdate = require('log-update');
const decompress = require('decompress');
const pjson = require('../package.json');
const spinner = cliSpinners.dots;

async function printSystemInfo() {
    const bi = [];
    bi.push({ label: 'node', info: process.version });

    const mem = await si.mem();
    bi.push({ label: 'Memory', info: Math.ceil(mem.total / 1024 / 1024 / 1024) + ' Gb' });

    const osInfo = await si.osInfo();
    // print(JSON.stringify(osInfo));
    bi.push({ label: 'OS', info: osInfo.distro + ' ' + osInfo.release });
    bi.push({ label: 'Kernel', info: osInfo.kernel });

    await printBox(bi, "System Information");
}

async function processorInfo() {
    const pi = [];
    const cpu = await si.cpu();
    pi.push({ label: 'Name', info: cpu.manufacturer + ' ' + cpu.brand });
    pi.push({ label: 'Details', info: cpu.processors + ' Processors, ' + cpu.physicalCores + ' Physical Cores, ' + cpu.cores + ' Cores' });
    pi.push({ label: 'Base Frequency', info: cpu.speed + ' GHz' });
    await printBox(pi, "Processor Information");
}

async function printBox(dt, title) {
    let largestLabelSize = 0;
    dt.forEach(el => {
        if (el.label.length > largestLabelSize) {
            largestLabelSize = el.label.length;
        }
    });

    const str = dt.reduce((prev, el) => prev + (prev && '\n') + info(pad(el.label, largestLabelSize), el.info), "");
    print(boxen(str, { title, padding: 1 }));
}

function print(msg) {
    process.stdout.write((msg || '') + '\n');
}

function info(label, info) {
    return label + ": " + chalk.green(info);
}

async function runCommand(cmdStr) {
    let spinnerMsg = cmdStr;
    let i = 0;

    const inter = setInterval(() => {
        const { frames } = spinner;
        logUpdate(frames[i = ++i % frames.length] + ' ' + spinnerMsg.replace(/(\r\n|\n|\r)/gm, "").trim());
    }, spinner.interval);

    return new Promise((resolve, reject) => {
        const cmdList = cmdStr.split(' ');

        const command = cmdList[0];
        const args = cmdList.slice(1);

        const cmd = spawn(command, args, { shell: true });

        cmd.stdout.on("data", data => {
            // print(`stdout: ${data}`);
            const newMsg = data && (data + '').trim();
            spinnerMsg = newMsg || spinnerMsg;
        });

        cmd.stderr.on("data", data => {
            // print(`stderr: ${data}`);
            const newMsg = data && (data + '').trim();
            spinnerMsg = newMsg || spinnerMsg;
        });

        cmd.on('error', (error) => {
            print(`error: ${error.message}`);
            print(JSON.stringify(error));
            throw new Error(error);
        });

        cmd.on("close", code => {
            clearInterval(inter);
            if (code == 0) {
                resolve();
            } else {
                reject(code);
            }
        });
    });
}

async function extractBuildReactApp(destDir, numberOfBuilds) {
    try {
        await decompress(path.join(__dirname, '..', 'assets', 'foo-bar.tar.gz'), destDir);
    } catch (err) {
        print(JSON.stringify(err));
        throw new Error(err);
    }
    process.chdir(path.join(destDir, 'foo-bar'));
    // print(console.log(process.cwd()));
    try {
        await runCommand('npm ci');
        for (let i = 0; i < numberOfBuilds; i++) {
            await runCommand('npm run build');
        }
    } catch (err) {
        print(JSON.stringify(err));
    }
}

async function bench() {
    const appPrefix = pjson.name;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), appPrefix));

    try {
        if (process.env.FAST_RUN) {
            print('>>>> FAST RUN ENABLED <<<<');
        }

        if (process.env.FAST_RUN) {
            print('FAST RUN: no warmup.');
        } else {
            print();
            print('Warming up...');
            await extractBuildReactApp(path.join(tmpDir, 'warm'), 0);
            logUpdate.clear()
            logUpdate.done();
        }

        print();
        print('Running benchmark...');
        print('The benchmark will install and compile a JavaScript project several times.');
        const timeBegin = Date.now();

        if (process.env.FAST_RUN) {
            await extractBuildReactApp(path.join(tmpDir, 'bench'), 1);
        } else {
            for (let i = 0; i < 3; i++) {
                await extractBuildReactApp(path.join(tmpDir, 'bench' + i), 10);
            }
        }

        logUpdate.clear()
        logUpdate.done();

        const timeEnd = Date.now();

        const secsTimeSpent = (timeEnd - timeBegin) / 1000;

        const minutes = Math.floor(secsTimeSpent / 60);
        const seconds = secsTimeSpent - minutes * 60;

        const results = [];
        results.push({ label: 'Total time', info: Math.floor(secsTimeSpent) + 's' });
        results.push({ label: 'Details', info: minutes + 'm:' + Math.floor(seconds) + 's' });
        print();
        await printBox(results, "Results");
    }
    catch (err) {
        print('Error...');
        print(JSON.stringify(err));
    }
    finally {
        try {
            process.chdir(path.join('..', tmpDir));

            if (tmpDir) {
                print();
                print('Temp dir: ' + tmpDir);
                let i = 0;
                const inter = setInterval(() => {
                    const { frames } = spinner;
                    logUpdate(frames[i = ++i % frames.length] + ' Cleaning temporary files...');
                }, spinner.interval);

                let success = false;
                try {
                    await rmDir(tmpDir);
                    success = true;
                } catch (err) {
                    try {
                        await rmDir(tmpDir);
                        success = true;
                    } catch (err) {
                        try {
                            await rmDir(tmpDir);
                            success = true;
                        } catch (err) {
                            print('Error cleaning temporary directory.');
                            print(JSON.stringify(err));
                        }
                    }
                }

                logUpdate.clear();
                logUpdate.done();

                clearInterval(inter);

                if (success) {
                    print('Temporary files cleaned!');
                }

                print('All done!');
            }
        }
        catch (e) {
            print(`An error has occurred while removing the temp folder at ${tmpDir}. Please remove it manually.Error: ${e} `);
        }
    }
}

async function rmDir(dir) {
    return new Promise((resolve, reject) => {
        rimraf(dir, err => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

async function run() {
    print();
    print(info(pjson.name, pjson.version));
    print();

    await printSystemInfo();

    await processorInfo();

    await bench();
}

run();