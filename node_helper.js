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
            this.getNetworkInfo();
        }
    },

    getNetworkInfo: function() {
        var self = this;
        var commands = {
            hostname: "hostname",
            internalIp: "hostname -I | awk '{print $1}'",
            publicIp: "dig +short myip.opendns.com @resolver1.opendns.com",
            tailscaleIp: "tailscale ip -4",
            networkDeviceCount: "arp -a | wc -l",
            moduleCount: `ls -d ${path.resolve(global.root_path, "modules")}/*/ | wc -l`
        };

        var promises = Object.keys(commands).map(key => {
            return new Promise((resolve, reject) => {
                exec(commands[key], (error, stdout, stderr) => {
                    if (error) {
                        console.error(`Error executing ${key}: ${error.message}`);
                        resolve({ key: key, value: "N/A" });
                        return;
                    }
                    if (stderr) {
                        console.error(`Stderr for ${key}: ${stderr}`);
                    }
                    resolve({ key: key, value: stdout.trim() });
                });
            });
        });

        Promise.all(promises).then(results => {
            var networkInfo = {};
            results.forEach(result => {
                networkInfo[result.key] = result.value;
            });

            if (networkInfo.publicIp && networkInfo.publicIp !== "N/A") {
                this.getGeolocation(networkInfo.publicIp, (geolocation) => {
                    networkInfo.geolocation = geolocation;
                    self.sendSocketNotification("NETWORK_INFO_RESULT", networkInfo);
                });
            } else {
                networkInfo.geolocation = "N/A";
                self.sendSocketNotification("NETWORK_INFO_RESULT", networkInfo);
            }
        });
    },

    getGeolocation: function(ip, callback) {
        exec(`curl -s http://ip-api.com/json/${ip}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Geolocation error: ${error.message}`);
                callback("N/A");
                return;
            }
            try {
                const geoData = JSON.parse(stdout);
                if (geoData.status === "success") {
                    callback(`${geoData.city}, ${geoData.regionName}, ${geoData.country}`);
                } else {
                    callback("N/A");
                }
            } catch (e) {
                console.error("Error parsing geolocation data:", e);
                callback("N/A");
            }
        });
    }
});
