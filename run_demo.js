$(document).ready(function() {
    var isChrome = !!window.chrome && !!window.chrome.webstore;
    var isFirefox = typeof InstallTrigger !== 'undefined';
    var isOpera = (!!window.opr && !!opr.addons) || !!window.opera || navigator.userAgent.indexOf(' OPR/') >= 0;
    
    if (isChrome || isFirefox || isOpera) {
        JSSDKDemo.run();
    } else {
        JSSDKDemo.create_alert("incompatible-browser", "It appears that you are using an unsupported browser. Please try this demo on Chrome, Firefox, or Opera.");
    }
});

var JSSDKDemo = (function() {
    
    var detector = null;
    var capture_frames = false;
    var frames_since_last_face = 0;
    var face_visible = true;
    var dominant_emoji = "";
    var frames_with_dominant_emoji = 0;
    var dominance_value_threshold = {flushed: 80, rage: 20, scream: 80, stuckOutTongue: 45, smiley: 40, kissing: 75, smirk: 80, wink: 65};
    var DOMINANCE_FRAME_THRESHOLD = 18;
    
    var dps = [
        {label: "flushed", y: 1},
        {label: "angry", y: 1},
        {label: "scream", y: 1},
        {label: "tongue out", y: 1},
        {label: "smile", y: 1},
        {label: "kissing", y: 1},
        {label: "smirk", y: 1},
        {label: "wink", y: 1},
    ];
    var label_to_emoji = {flushed: "flushed", angry: "rage", scream: "scream", tongueout: "stuckOutTongue", smile: "smiley", kissing: "kissing", smirk: "smirk", wink: "wink"};
    var emoji_to_color = {flushed: "rgba(244,127,56,1)", rage: "rgba(232,63,111,1)", scream: "rgba(141,105,111,1)", stuckOutTongue: "rgba(50,147,111,1)", smiley: "rgba(42,132,138,1)", kissing: "rgba(34,116,165,1)", smirk: "rgba(145,154,83,1)", wink: "rgba(255,191,0,1)"};
    var emoji_to_giphy_keywords = {flushed: "embarrassed", rage: "angry", scream: "scream", stuckOutTongue: "tongue out", smiley: "smile", kissing: "kissing", smirk: "smirk", wink: "wink"};
    
    var GIF_COUNT = 12;
    var num_gifs_loaded = 0;
    
    var run = function() {
        $("#btn-start").one("click", start_button_click);
        
        var facevideo_node = document.getElementById("facevideo-node");
        detector = new affdex.CameraDetector(facevideo_node);
        detector.detectAllEmojis();
        
        detector.addEventListener("onWebcamConnectSuccess", function() {
            show_message("msg-starting-webcam");
        });
        
        detector.addEventListener("onWebcamConnectFailure", function() {
            show_message("msg-webcam-failure");
        });
        
        if (detector && !detector.isRunning) {
            detector.start();
        }
        
        // get the video element inside the div with id "facevideo-node"
        var face_video = $("#facevideo-node video")[0];
        face_video.addEventListener("playing", function() {
            show_message("msg-detector-status");
        });
        
        detector.addEventListener("onInitializeSuccess", function() {
            show_message("instructions");
        });
        
        detector.addEventListener("onImageResultsSuccess", function(faces, image, timestamp) {
            if (capture_frames) {
                if (frames_since_last_face > 300 && face_visible) {
                    face_visible = false;
                    create_alert("no-face", "No face was detected. Please re-position your face and/or webcam.");
                }
                
                if (faces.length > 0) {
                    var emoji_values = faces[0].emojis;
                    
                    // remove alert when face comes back
                    if (!face_visible) {
                        face_visible = true;
                        fade_and_remove("#no-face");
                        $("#lightbox").fadeOut(1000);
                    }
                    frames_since_last_face = 0;
                    
                    // update colors of chart
                    var data_list = chart.options.data[0].dataPoints;
                    for (var i = 0; i < data_list.length; i++) {
                        var emoji = get_emoji_from_label(data_list[i].label);
                        var color = emoji_to_color[emoji].replace(/1\)/, (emoji_values[emoji] / 150.0 + 0.333) + ")");
                        set_emoji_color(data_list[i], color);
                    }
                    
                    // determine dominant emoji
                    var max_emoji = "flushed";
                    var max_value = emoji_values["flushed"];
                    for (var emoji in emoji_values) {
                        if (emoji_to_color.hasOwnProperty(emoji)) {
                            var value = emoji_values[emoji];
                            if (value > max_value) {
                                max_emoji = emoji;
                                max_value = value;
                            }
                        }
                    }
                    
                    // update dominant_emoji and frames_with_dominant_emoji
                    if (max_value > dominance_value_threshold[max_emoji]) {
                        if (max_emoji === dominant_emoji) {
                            frames_with_dominant_emoji++;
                            
                            // same dominant emoji, increase its share of the circle
                            for (var i = 0; i < dps.length; i++) {
                                var dominant_fraction = 1.0 / dps.length + frames_with_dominant_emoji / DOMINANCE_FRAME_THRESHOLD * (1.0 - 1.0 / dps.length)
                                if (get_emoji_from_label(dps[i]["label"]) === dominant_emoji) {
                                    dps[i]["y"] = dominant_fraction;
                                } else {
                                    dps[i]["y"] = (1.0 - dominant_fraction) / (dps.length - 1);
                                }
                            }
                        } else {
                            dominant_emoji = max_emoji;
                            frames_with_dominant_emoji = 1;
                            
                            // change in dominant emoji, make everything equal
                            for (var i = 0; i < dps.length; i++) {
                                dps[i]["y"] = 1.0 / dps.length;
                            }
                        }
                    } else {
                        frames_with_dominant_emoji = 0;
                        
                        // no dominant emojis detected, make everything equal
                        for (var i = 0; i < dps.length; i++) {
                            dps[i]["y"] = 1.0 / dps.length;
                        }
                    }
                    
                    // check if dominant emoji has been present for enough frames
                    if (frames_with_dominant_emoji >= DOMINANCE_FRAME_THRESHOLD - 1 && emoji_to_giphy_keywords.hasOwnProperty(dominant_emoji)) {
                        // pause capture
                        capture_frames = false;
                        
                        // search for GIFs
                        var url = "https://api.giphy.com/v1/gifs/search?q=" + emoji_to_giphy_keywords[dominant_emoji] + "&api_key=dc6zaTOxFJmzC&limit=" + GIF_COUNT + "&rating=pg";
                        http_get_async(url, add_gifs_to_page);
                        
                        // explode the selected emoji, fade all other emojis
                        var data_list = chart.options.data[0].dataPoints;
                        for (var i = 0; i < data_list.length; i++) {
                            var emoji = get_emoji_from_label(data_list[i].label);
                            if (emoji === dominant_emoji) {
                                data_list[i].exploded = true;
                                var color = emoji_to_color[dominant_emoji];
                                set_emoji_color(data_list[i], color);
                            } else {
                                var color = emoji_to_color[emoji].replace(/1\)/, "0.333)");
                                set_emoji_color(data_list[i], color);
                            }
                        }
                    }
                } else {
                    // no face found
                    frames_since_last_face++;
                }
                
                requestAnimationFrame(chart.render);
            }
        });
    };
        
    var start_button_click = function(event) {
        $("#messages").fadeOut(500, function() {
            init_chart();
            capture_frames = true;
            $("#chart-container").fadeIn(500);
        });
    };
    
    var init_chart = function() {
        chart = new CanvasJS.Chart("chart-container", {
            title: {
                text: "Emoji Wheel",
                fontColor: "white"
            },
            data: [{
                type: "doughnut",
                dataPoints: dps,
            }],
            interactivityEnabled: false,
            backgroundColor: null
        });
        
        var data_list = chart.options.data[0].dataPoints;
        for (var i = 0; i < data_list.length; i++) {
            var emoji = get_emoji_from_label(data_list[i].label);
            var color = emoji_to_color[emoji].replace(/1\)/, "0.333)");
            set_emoji_color(data_list[i], color);
            data_list[i].exploded = false;
        }
    };
    
    var get_emoji_from_label = function(label) {
        return label_to_emoji[label.replace(/\s+/g, "")];
    };
    
    var set_emoji_color = function(data_element, color) {
        data_element.color = color;
        data_element.indexLabelFontColor = color;
        data_element.indexLabelLineColor = color;
    };
    
    var add_gifs_to_page = function(json) {
        var gifs = json.data;
        
        gifs.forEach(function(element, index) {
            $("#results").append('<div style="display:inline-block; background-image:url(demo/ring.svg); background-position:center; background-repeat:no-repeat"><iframe src=' + element.embed_url + '?html5=true width="285" height="179" frameBorder="0" class="giphy-embed" onload="JSSDKDemo.gif_load(this)"></iframe></div>');
        });
        
        // scroll to results
        $("html, body").animate({
            scrollTop: $("#results").offset().top - 15
        });
    };
    
    var gif_load = function() {
        if (++num_gifs_loaded == GIF_COUNT) {
            $("#facevideo-node").append('<div id="try-again"><h1 style="margin-top:200px">Click here to try again!</h1></div>');
            $("#try-again").fadeIn(500);
            
            $("#try-again").one("click", function() {
                fade_and_remove("#" + this.id);
                $("#results").fadeOut(500, function() {
                    $(this).empty();
                    $(this).css("display", "block")
                });
                
                // clear and re-initialize the chart
                $("#chart-container").empty();
                init_chart();
                
                // reset variables
                frames_since_last_face = 0;
                face_visible = true;
                dominant_emoji = "";
                frames_with_dominant_emoji = 0;
                num_gifs_loaded = 0;
                capture_frames = true;
            });
        }
    };
    
    var http_get_async = function(url, callback) {
        var xmlHttp = new XMLHttpRequest();
        xmlHttp.onreadystatechange = function() {
            if (xmlHttp.readyState == 4 && xmlHttp.status == 200) {
                callback(JSON.parse(xmlHttp.responseText));
            }
        };
        xmlHttp.open("GET", url, true);
        xmlHttp.send(null);
    };
    
    var create_alert = function(id, text) {
        $("#lightbox").fadeIn(500);
        $("<div></div>", {
            id: id,
            class: "alert alert-danger",
            display: "none",
            text: text,
        }).appendTo("#lightbox");
        $("#" + id).css({"text-align": "center", "z-index": 2});
        $("#" + id).fadeIn(1000);
    };
    
    var show_message = function(id) {
        $(".demo-message").hide();
        $(document.getElementById(id)).fadeIn("fast");
    };
    
    var fade_and_remove = function(id) {
        $(id).fadeOut(500, function() {
            this.remove();
        });
    };
    
    
    
    return {
        run: run,
        create_alert: create_alert,
        gif_load: gif_load
    };
})();
