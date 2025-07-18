/*
 * MagicMirror² Module: MMM-Network-Info
 *
 * By [Your Name]
 * MIT Licensed.
 */

// MMM-Network-Info.js

Module.register("MMM-Network-Info", {
    // Default module config.
    defaults: {
        updateInterval: 10 * 60 * 1000, // every 10 minutes
        animationSpeed: 1000,
        initialLoadDelay: 2500,
        title: "Network & System Info"
    },

    // Define start sequence.
    start: function() {
        Log.info("Starting module: " + this.name);
        this.loaded = false;
        this.data.header = this.config.title;
        this.networkInfo = {};
        this.scheduleUpdate(this.config.initialLoadDelay);
        this.updateTimer = null;
    },

    // Override dom generator.
    getDom: function() {
        var wrapper = document.createElement("div");

        if (!this.loaded) {
            wrapper.innerHTML = "Loading network info...";
            wrapper.className = "dimmed light small";
            return wrapper;
        }

        var table = document.createElement("table");
        table.className = "small";

        var info = this.networkInfo;

        var rows = [
            { label: "Hostname", value: info.hostname },
            { label: "Internal IP", value: info.internalIp },
            { label: "Public IP", value: info.publicIp },
            { label: "Tailscale IP", value: info.tailscaleIp },
            { label: "IP Geolocation", value: info.geolocation },
            { label: "Devices on Network", value: info.networkDeviceCount },
            { label: "Installed Modules", value: info.moduleCount }
        ];

        rows.forEach(function(row) {
            if (row.value) {
                var tr = document.createElement("tr");
                table.appendChild(tr);

                var tdLabel = document.createElement("td");
                tdLabel.className = "label";
                tdLabel.innerHTML = row.label;
                tr.appendChild(tdLabel);

                var tdValue = document.createElement("td");
                tdValue.className = "value";
                tdValue.innerHTML = row.value;
                tr.appendChild(tdValue);
            }
        });

        wrapper.appendChild(table);
        return wrapper;
    },

    // Override notification handler.
    socketNotificationReceived: function(notification, payload) {
        if (notification === "NETWORK_INFO_RESULT") {
            this.networkInfo = payload;
            this.loaded = true;
            this.updateDom(this.config.animationSpeed);
        }
    },

    // Schedule the next update.
    scheduleUpdate: function(delay) {
        var nextLoad = this.config.updateInterval;
        if (typeof delay !== "undefined" && delay >= 0) {
            nextLoad = delay;
        }

        var self = this;
        clearTimeout(this.updateTimer);
        this.updateTimer = setTimeout(function() {
            self.getNetworkInfo();
        }, nextLoad);
    },

    // Request network info from node_helper.
    getNetworkInfo: function() {
        this.sendSocketNotification("GET_NETWORK_INFO");
    },

    // Add a custom CSS file.
    getStyles: function() {
        return ["MMM-Network-Info.css"];
    }
});
