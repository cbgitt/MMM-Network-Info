// node_helper.js for MMM-Network-Info

const NodeHelper = require("node_helper");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");

module.exports = NodeHelper.create({
    start: function() {
        console.log("Starting node_helper for: " + this.name);
    },

    socketNotificationReceived: function(notification, payload) {
        if (notification === "GET_NETWORK_INFO") {
            this.getNetworkInfo(payload);
        }
    },

    executeCommand: function(command, key) {
        return new Promise((resolve) => {
            exec(command, { timeout: 5000 }, (error, stdout, stderr) => {
                if (error) {
                    console.error(`MMM-Network-Info: Error executing command for '${key}': ${error.message}`);
                    resolve({ key: key, value: "Not available" });
                    return;
                }
                if (stderr) {
                    console.log(`MMM-Network-Info: Stderr for '${key}': ${stderr.trim()}`);
                }
                resolve({ key: key, value: stdout.trim() });
            });
        });
    },

    getNetworkInfo: async function(config) {
        var self = this;
        const show = config.show;
        console.log("MMM-Network-Info: Received request to get network info.");

        var promises = [];
        var commands = {};

        if (show.hostname) commands.hostname = "hostname";
        if (show.internalIp) commands.internalIp = "hostname -I | awk '{print $1}'";
        if (show.publicIp || show.geolocation) commands.publicIp = "dig +short myip.opendns.com @resolver1.opendns.com";
        if (show.tailscaleIp) commands.tailscaleIp = "tailscale ip -4";

        // If listDevices is true, we get the full list. Otherwise, we just get the count if enabled.
        if (show.listDevices) {
            commands.deviceList = "arp -a";
        } else if (show.networkDeviceCount) {
            commands.networkDeviceCount = "arp -a | wc -l";
        }
        
        console.log("MMM-Network-Info: Will execute the following commands:", Object.keys(commands));

        for (const [key, command] of Object.entries(commands)) {
            promises.push(this.executeCommand(command, key));
        }

        if (show.moduleCount) {
            const modulePath = path.resolve(global.root_path, "modules");
            const modulePromise = new Promise((resolve) => {
                fs.readdir(modulePath, { withFileTypes: true }, (err, files) => {
                    if (err) {
                        console.error("MMM-Network-Info: Could not read modules directory:", err);
                        resolve({ key: 'moduleCount', value: 'N/A' });
                    } else {
                        const directoryCount = files.filter(dirent => dirent.isDirectory()).length;
                        resolve({ key: 'moduleCount', value: directoryCount.toString() });
                    }
                });
            });
            promises.push(modulePromise);
        }

        if (promises.length === 0) {
            self.sendSocketNotification("NETWORK_INFO_RESULT", {});
            return;
        }

        const results = await Promise.all(promises);
        
        var networkInfo = {};
        results.forEach(result => {
            if (result.value) {
                networkInfo[result.key] = result.value;
            }
        });

        // Parse the device list if it exists
        if (networkInfo.deviceList) {
            const lines = networkInfo.deviceList.split('\n');
            const devices = [];
            const macRegex = /([0-9a-fA-F]{1,2}:){5}[0-9a-fA-F]{1,2}/;

            lines.forEach(line => {
                const macMatch = line.match(macRegex);
                if (macMatch) {
                    const parts = line.split(' ');
                    const ip = parts[1].replace(/[()]/g, ''); // Extract IP and remove parentheses
                    devices.push({ ip: ip, mac: macMatch[0] });
                }
            });
            networkInfo.deviceList = devices;
            // If we need the count, we derive it from the list we just made.
            if (show.networkDeviceCount) {
                networkInfo.networkDeviceCount = devices.length.toString();
            }
        }

        if (show.geolocation && networkInfo.publicIp && networkInfo.publicIp !== "Not available") {
            this.getGeolocation(networkInfo.publicIp, (geolocation) => {
                networkInfo.geolocation = geolocation;
                if (!show.publicIp) delete networkInfo.publicIp;
                self.sendSocketNotification("NETWORK_INFO_RESULT", networkInfo);
            });
        } else {
            if (!show.publicIp && networkInfo.hasOwnProperty('publicIp')) delete networkInfo.publicIp;
            self.sendSocketNotification("NETWORK_INFO_RESULT", networkInfo);
        }
    },

    getGeolocation: function(ip, callback) {
        this.executeCommand(`curl -s http://ip-api.com/json/${ip}`, 'geolocation').then(result => {
            if (result.value === "Not available") {
                callback("N/A");
                return;
            }
            try {
                const geoData = JSON.parse(result.value);
                if (geoData.status === "success") {
                    callback(`${geoData.city}, ${geoData.regionName}, ${geoData.country}`);
                } else {
                    callback("N/A");
                }
            } catch (e) {
                callback("N/A");
            }
        });
    }
});
