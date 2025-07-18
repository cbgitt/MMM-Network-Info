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

    // Helper function to execute shell commands with a timeout
    executeCommand: function(command, key) {
        return new Promise((resolve) => {
            exec(command, { timeout: 5000 }, (error, stdout, stderr) => { // 5-second timeout
                if (error) {
                    // This will catch timeouts and other execution errors.
                    console.error(`MMM-Network-Info: Error executing command for '${key}': ${error.message}`);
                    resolve({ key: key, value: "Not available" });
                    return;
                }
                if (stderr) {
                    // stderr is not always a true error, so we log it for debugging purposes.
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

        // Conditionally build the commands object based on the config
        if (show.hostname) commands.hostname = "hostname";
        if (show.internalIp) commands.internalIp = "hostname -I | awk '{print $1}'";
        if (show.publicIp || show.geolocation) commands.publicIp = "dig +short myip.opendns.com @resolver1.opendns.com";
        if (show.tailscaleIp) commands.tailscaleIp = "tailscale ip -4";
        if (show.networkDeviceCount) commands.networkDeviceCount = "arp -a | wc -l";
        
        console.log("MMM-Network-Info: Will execute the following commands:", Object.keys(commands));

        // Create promises for all shell commands
        for (const [key, command] of Object.entries(commands)) {
            promises.push(this.executeCommand(command, key));
        }

        // Handle module count with Node's fs module for better reliability
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
            console.log("MMM-Network-Info: Will count modules in directory.");
        }

        if (promises.length === 0) {
            console.log("MMM-Network-Info: No items enabled in config. Sending empty result.");
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
        console.log("MMM-Network-Info: All commands finished. Results:", networkInfo);

        // Handle geolocation separately after getting the public IP
        if (show.geolocation && networkInfo.publicIp && networkInfo.publicIp !== "Not available") {
            console.log("MMM-Network-Info: Fetching geolocation for IP:", networkInfo.publicIp);
            this.getGeolocation(networkInfo.publicIp, (geolocation) => {
                networkInfo.geolocation = geolocation;
                if (!show.publicIp) {
                    delete networkInfo.publicIp;
                }
                console.log("MMM-Network-Info: Sending final data with geolocation.");
                self.sendSocketNotification("NETWORK_INFO_RESULT", networkInfo);
            });
        } else {
            if (!show.publicIp && networkInfo.hasOwnProperty('publicIp')) {
                delete networkInfo.publicIp;
            }
            console.log("MMM-Network-Info: Sending final data without geolocation.");
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
                    console.error("MMM-Network-Info: Geolocation API returned status:", geoData.status);
                    callback("N/A");
                }
            } catch (e) {
                console.error("MMM-Network-Info: Error parsing geolocation JSON:", e);
                callback("N/A");
            }
        });
    }
});
