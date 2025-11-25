$(function () {
    var api = "http://192.168.254.254/api/";
    var xml = '<?xml version="1.0" encoding="UTF-8"?><request>';

    var getAjax = function (resource) {
        var endpoint = api + resource;
        return $.ajax({
            url: endpoint,
            dataType: 'xml',
            timeout: 5000
        });
    }

    var postAjax = function (resource, data, tokenOrTokens) {
        var endpoint = api + resource;

        var headers = {};

        // tokenOrTokens can be a string or an array
        if ($.isArray(tokenOrTokens)) {
            if (tokenOrTokens[0]) {
                headers['__RequestVerificationToken'] = tokenOrTokens[0];
            }
            if (tokenOrTokens[1]) {
                // many Huawei firmwares expect this second header
                headers['__RequestVerificationTokenOne'] = tokenOrTokens[1];
            }
        } else if (tokenOrTokens) {
            headers['__RequestVerificationToken'] = tokenOrTokens;
        }

        return $.ajax({
            type: "POST",
            url: endpoint,
            headers: headers,
            data: data,
            contentType: "text/xml",
            dataType: 'xml',
            timeout: 5000
        });
    }

    var getStatus = function () {
        var resource = "device/signal";
        return getAjax(resource);
    }

    var getAntennaStatus = function () {
        var resource = "device/antenna_type";
        return getAjax(resource);
    }

    var getAntennaSetType = function () {
        var resource = "device/antenna_set_type";
        return getAjax(resource);
    }

    var getToken = function () {
        var resource = "webserver/token";
        return getAjax(resource);
    }

    var getXML = function (xml, tag) {
        return $(xml).find(tag).first().text();
    }

    var getSignalRate = function (obj, grade) {

        /*
            excellent = 3
            good = 2
            fair = 1
            poor = 0
            https://usatcorp.com/faqs/understanding-lte-signal-strength-values/
        */
        var rate = 0;
        switch (obj) {
            case "rsrp":
                rate = rateRsrp(grade);
                break;
            case "rsrq":
                rate = rateRsrq(grade);
                break;
            case "sinr":
                rate = rateSinr(grade);
                break;
            default:
        }
        return rate;
    }

    var getPercentage = function (grade, min, max, max2) {

        var percentage = ((grade - min) * 100) / (max - min);
        if (percentage > 100) {
            if (typeof max2 !== 'undefined') {
                percentage = ((max2 - grade) * 100) / (max2 - max);
                if (percentage < 0) {
                    percentage = 0;
                }
            } else {
                percentage = 100;
            }
        } else if (percentage < 0) {
            percentage = 0;
        }
        return percentage;
    }

    var getSignalPercentage = function (obj, gradetxt) {
        gradetxt = gradetxt.replace(/[<=>]/g, '');
        var grade = parseInt(gradetxt);
        var percent = 0;
        switch (obj) {
            case "rsrp":
                percent = getPercentage(grade, -120, -75);
                break;
            case "rsrq":
                percent = getPercentage(grade, -16, 0);
                break;
            case "sinr":
                percent = getPercentage(grade, 0, 20);
                break;
            default:
        }
        return percent;
    }

    var getLoginStatus = function () {
        var resource = "user/heartbeat";
        return getAjax(resource);
    }

    var rateRsrp = function (gradetxt) {
        var grade = parseInt(gradetxt);

        if (grade >= -84) {
            return 3;
        } else if (grade >= -94 && grade <= -85) {
            return 2;
        } else if (grade >= -111 && grade <= -95) {
            return 1;
        } else {
            //15%-
            return 0;
        }

    }

    var rateRsrq = function (gradetxt) {

        var grade = parseInt(gradetxt);

        if (grade >= -4) {
            return 3;
        } else if (grade >= -9 && grade <= -5) {
            return 2;
        } else if (grade >= -13 && grade <= -10) {
            return 1;
        } else {
            return 0;
        }
    }

    var rateSinr = function (gradetxt) {
        var grade = parseInt(gradetxt);

        if (grade >= 13) {
            return 3;
        } else if (grade >= 10 && grade <= 12) { //
            return 2;
        } else if (grade >= 7 && grade <= 9) {
            return 1;
        } else {
            return 0;
        }
    }

    var updateBand = function (band, tokens) {
        var resource = "net/net-mode";
        var data = xml + '<NetworkMode>03</NetworkMode><NetworkBand>100000000C680380</NetworkBand><LTEBand>' + band + '</LTEBand></request>';
        return postAjax(resource, data, tokens);
    }

    var updateAntenna = function (antenna, tokens) {
        var resource = "device/antenna_set_type";
        var data = xml + '<antennasettype>' + antenna + '</antennasettype></request>';
        return postAjax(resource, data, tokens);
    }

    // --- DHCP / DNS helpers -----------------------------------

    // GET current DHCP/DNS settings  -> /api/dhcp/settings
    var getDhcpSettings = function () {
        var resource = "dhcp/settings";
        return getAjax(resource);
    };

    // POST updated DHCP/DNS settings back to the router
    // Use the same structure as the original web UI request.
    var updateDhcpDns = function (primaryDns, secondaryDns, manualDnsEnabled, tokens, currentXml) {
        var dhcpIp = getXML(currentXml, 'DhcpIPAddress');        // 192.168.254.254
        var dhcpStart = getXML(currentXml, 'DhcpStartIPAddress');   // 192.168.254.100
        var dhcpEnd = getXML(currentXml, 'DhcpEndIPAddress');     // 192.168.254.200
        var dhcpLease = getXML(currentXml, 'DhcpLeaseTime') || '43200';
        var dhcpStatus = getXML(currentXml, 'DhcpStatus') || '1';
        var lanMask = getXML(currentXml, 'DhcpLanNetmask') || '255.255.255.0';
        var accessIp = getXML(currentXml, 'accessipaddress') || '';
        var homeurl = getXML(currentXml, 'homeurl') || 'globebroadband.net';

        // Current DnsStatus from router
        var currentDnsStatus = getXML(currentXml, 'DnsStatus') || '1';

        // DnsStatus mapping based on your firmware:
        //   0 = manual (use PrimaryDns / SecondaryDns)
        //   1 = automatic / ISP
        var dnsStatus = currentDnsStatus;

        if (typeof manualDnsEnabled === 'boolean') {
            dnsStatus = manualDnsEnabled ? '0' : '1';
        }

        // Build XML EXACTLY like the UI does
        var data =
            xml +
            '<DnsStatus>' + dnsStatus + '</DnsStatus>' +
            '<DhcpStartIPAddress>' + dhcpStart + '</DhcpStartIPAddress>' +
            '<DhcpIPAddress>' + dhcpIp + '</DhcpIPAddress>' +
            '<accessipaddress>' + accessIp + '</accessipaddress>' +
            '<homeurl>' + homeurl + '</homeurl>' +
            '<DhcpStatus>' + dhcpStatus + '</DhcpStatus>' +
            '<DhcpLanNetmask>' + lanMask + '</DhcpLanNetmask>' +
            '<SecondaryDns>' + (secondaryDns || '') + '</SecondaryDns>' +
            '<PrimaryDns>' + primaryDns + '</PrimaryDns>' +
            '<DhcpEndIPAddress>' + dhcpEnd + '</DhcpEndIPAddress>' +
            '<DhcpLeaseTime>' + dhcpLease + '</DhcpLeaseTime>' +
            '</request>';

        // Keep showing it in the debug box
        var $debugWrapper = $("#dns-debug-wrapper");
        var $debugBox = $("#dns-debug-xml");
        if ($debugWrapper.length && $debugBox.length) {
            $debugWrapper.show();
            $debugBox.val(data);
        }

        return postAjax("dhcp/settings", data, tokens);
    };

    // --- DNS Presets -------------------------------
    var dnsPresets = {
        google: {
            label: "Google DNS (8.8.8.8 / 8.8.4.4)",
            primary: "8.8.8.8",
            secondary: "8.8.4.4"
        },
        cloudflare: {
            label: "Cloudflare (1.1.1.1 / 1.0.0.1)",
            primary: "1.1.1.1",
            secondary: "1.0.0.1"
        },
        opendns: {
            label: "OpenDNS (208.67.222.222 / 208.67.220.220)",
            primary: "208.67.222.222",
            secondary: "208.67.220.220"
        },
        quad9: {
            label: "Quad9 (9.9.9.9 / 149.112.112.112)",
            primary: "9.9.9.9",
            secondary: "149.112.112.112"
        },
        adguard: {
            label: "AdGuard (94.140.14.14 / 94.140.15.15)",
            primary: "94.140.14.14",
            secondary: "94.140.15.15"
        }
    };

    // New: SesTokInfo – some firmwares use this token for settings pages
    var getSesTokInfo = function () {
        return $.ajax({
            url: api + "webserver/SesTokInfo",
            type: "GET",
            dataType: "xml",
            timeout: 5000
        });
    };

    function processSignalStatus() {
        getStatus().success(function (resp) {
            //do something when the server responded
            var band = getXML(resp, 'band');
            var pci = getXML(resp, 'pci');
            var cell_id = getXML(resp, 'cell_id');
            var rsrq = getXML(resp, 'rsrq');
            var rsrp = getXML(resp, 'rsrp');
            var sinr = getXML(resp, 'sinr');

            $("#band").text(band);
            $("#pci").text(pci);
            $("#cellid").text(cell_id);
            updateSignal("rsrp", rsrp);
            updateSignal("rsrq", rsrq);
            updateSignal("sinr", sinr);
        }).error(function () {
            console.log("Error when updating status.");
        });
    }

    function processAntennaStatus() {
        getAntennaStatus().success(function (resp) {
            var antenna = getXML(resp, 'antennatype');
            var _text = antenna == 0 ? "Internal" : "External";
            $("#antenna").text(_text);

        }).error(function () {
            console.log("Error when fetching antenna status.");
        });
    }

    function processLoginStatus() {
        getLoginStatus().success(function (resp) {
            var userlevel = getXML(resp, 'userlevel');
            var router = $("#connection #router");
            var user = $("#connection  #user");

            router.attr("class", "online");
            router.children("title").html("Connected");
            if (userlevel > 0) {
                user.attr("class", "online");
                user.children("title").html("Logged-in");
            } else {
                user.attr("class", "offline");
                user.children("title").html("Logged-out");
            }

        }).error(function () {
            console.log("Not Connected.");
        });
    }

    function debugUserLevel() {
        getLoginStatus().done(function (resp) {
            var userlevel = getXML(resp, 'userlevel') || '0';
            // 0 = not logged in
            // 1 / 2 / 3 etc. -> depends on firmware (often 2 or 3 is admin)
            alert("Router userlevel from /user/heartbeat: " + userlevel);
        }).fail(function () {
            alert("Cannot read userlevel (not connected).");
        });
    }

    // TEMP: call this once when popup loads
    //debugUserLevel();

    function updateSignal(obj, grade) {

        var _id = "#" + obj; //change to class if needed        

        var _class = "";
        var _text = "";

        var width = getSignalPercentage(obj, grade) + "%"; //
        var rate = getSignalRate(obj, grade);
        switch (rate) {
            case 3:
                _text = "Excellent";
                break;
            case 2:
                _text = "Good";
                break;
            case 1:
                _text = "Average";
                break;
            case 0:
                _text = "Poor";
                break;
            default:
                _text = "Unknown";
                width = "0px";
        }

        _class = "bar-" + _text.toLowerCase();

        //remove previous bar-* class
        $(_id + " .progress-bar").removeClass(function (i, classname) {
            return (classname.match(/(^|\s)bar-\S+/g) || []).join(' ');
        });
        $(_id + " .progress-bar").width(width);
        $(_id + " .progress-bar").addClass(_class);

        $(_id + " .txt-rate").text(_text);
        $(_id + " .grade").text(grade);
    }

    // Initialize DHCP / DNS section
    function initDhcpDns() {
        // try to read current DHCP settings
        getDhcpSettings().success(function (resp) {
            // If the router exposes DHCP settings, show the block
            if ($("#dhcp_dns").length) {
                $("#dhcp_dns").show();
            }

            // New: reflect manual/auto status in checkbox
            var primary = getXML(resp, 'PrimaryDns');
            var secondary = getXML(resp, 'SecondaryDns');
            var dnsStatus = getXML(resp, 'DnsStatus') || '1';
            var showDns = getXML(resp, 'ShowDnsSetting'); // may be empty

            // Heuristic: treat "manual" as dnsStatus == '0' OR ShowDnsSetting == '1'
            var isManual = (dnsStatus === '0') || (showDns === '1');

            $("#dns_manual").prop('checked', isManual);

            if (primary) {
                $('#dns_primary').val(primary);
            }
            if (secondary) {
                $('#dns_secondary').val(secondary);
            }

            // Try to auto-select matching preset
            Object.keys(dnsPresets).forEach(function (key) {
                var p = dnsPresets[key];
                if (p.primary === primary && p.secondary === (secondary || "")) {
                    $("#dns_preset").val(key);
                }
            });

        }).error(function () {
            console.log("DHCP / DNS API not available (dhcp/settings).");
        });
    }

    $("#form-band button").click(function (e) {

        e.preventDefault();
        var button = $(this);
        var bandbuttons = $("#form-band button");

        var band = button.val();

        bandbuttons.prop('disabled', true);

        $("#form-band .loader").show();
        //get a token
        getToken().success(function (resp) {

            var token = $(resp).find('token').first().text();

            //update band            
            updateBand(band, [token]).success(function (resp) {
                //do something when the server responded .
                console.log("Band updated");

            }).error(function () {
                console.log("Error when updating band.");
            }).done(function () {
                $("#form-band .loader").hide();
                bandbuttons.prop('disabled', false);
                processSignalStatus();
            });
        }).error(function () {
            console.log("Error when getting token.");
        });

    });

    $("#form-antenna button").click(function (e) {
        e.preventDefault();

        var button = $(this);
        var antennabuttons = $("#form-antenna button");

        var antenna = button.val(); //value of antenna

        antennabuttons.prop('disabled', true);

        $("#form-antenna .loader").show();

        //get a token
        getToken().success(function (resp) {

            var token = $(resp).find('token').first().text();

            updateAntenna(antenna, [token]).success(function (resp) {

                $("#form-antenna .loader").hide();
                antennabuttons.prop('disabled', false);
                processAntennaStatus();
            }).error(function () {
                console.log("Error when updating antenna.");
            });


            //console.log("Token: ",token)
        }).error(function () {
            console.log("Error when getting token.");
        });
    });

    $("#form-dns").on("submit", function (e) {
        e.preventDefault();

        var primary = $("#dns_primary").val();
        var secondary = $("#dns_secondary").val();
        var manualDns = $("#dns_manual").is(":checked");
        var $btn = $("#dns-save");

        if (!primary) {
            alert("Please enter at least a Primary DNS.");
            return;
        }

        $btn.prop("disabled", true);
        $("#dns-loader").show();

        $.when(getSesTokInfo(), getDhcpSettings()).done(function (sesTokResp, dhcpResp) {
            var infoXml = sesTokResp[0];
            var dhcpXml = dhcpResp[0];

            // Example TokInfo: "__RequestVerificationToken=abcd1234"
            var tokInfo = $(infoXml).find('TokInfo').first().text() || "";
            var token = tokInfo.replace('__RequestVerificationToken=', '').trim();

            // Use single-token array so postAjax() sets __RequestVerificationToken
            var tokens = [token];

            updateDhcpDns(primary, secondary, manualDns, tokens, dhcpXml)
                .done(function (resp, textStatus, jqXHR) {
                    var respStr = new XMLSerializer().serializeToString(resp);

                    var $debugWrapper = $("#dns-debug-wrapper");
                    var $debugBox = $("#dns-debug-xml");
                    if ($debugWrapper.length && $debugBox.length) {
                        $debugWrapper.show();
                        $debugBox.val($debugBox.val() + "\n\n--- RESPONSE ---\n" + respStr);
                    }

                    var errCode = $(resp).find('error > code').text();
                    if (errCode) {
                        $("#general-alert .alert-text").text("Router returned error code: " + errCode);
                        $("#general-alert")
                            .removeClass("alert-primary")
                            .addClass("alert-danger")
                            .show();
                        return;
                    }

                    $("#general-alert .alert-text").text(
                        "DNS updated. You may need to reconnect clients."
                    );
                    $("#general-alert")
                        .removeClass("alert-danger")
                        .addClass("alert-primary")
                        .show();
                })
                .fail(function (jqXHR, textStatus, errorThrown) {
                    console.log("XHR ERROR:", textStatus, errorThrown, jqXHR.responseText);
                    $("#general-alert .alert-text").text("Error updating DNS settings (HTTP).");
                    $("#general-alert")
                        .removeClass("alert-primary")
                        .addClass("alert-danger")
                        .show();
                })
                .always(function () {
                    $btn.prop("disabled", false);
                    $("#dns-loader").hide();
                });

        }).fail(function () {
            console.log("Error getting SesTokInfo and/or DHCP settings.");
            $btn.prop("disabled", false);
            $("#dns-loader").hide();
        });

    });

    // When user selects a preset, auto-fill the fields (no auto-save)
    $("#dns_preset").on("change", function () {
        var key = $(this).val();
        if (!key || !dnsPresets[key]) {
            // "Custom / Manual" or unknown -> do nothing
            return;
        }
        var preset = dnsPresets[key];
        $("#dns_primary").val(preset.primary);
        $("#dns_secondary").val(preset.secondary);
    });

    processAntennaStatus();
    processSignalStatus();
    processLoginStatus();
    initDhcpDns();
    setInterval(function () {
        processSignalStatus();
        processLoginStatus();
    }, 10000);

});