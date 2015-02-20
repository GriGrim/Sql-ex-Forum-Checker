/*
 * Copyright (c) 2013 Danila Chebykin.
 * All rights reserved.
 * Use of this source code is governed by a BSD license.
 */

var animationFrames = 36;
var animationSpeed = 10; // ms
var canvas = document.getElementById('canvas');
var loggedInImage = document.getElementById('logged_in');
var canvasContext = canvas.getContext('2d');
var pollIntervalMin = 1;  // 1 minute
var pollIntervalMax = 60;  // 1 hour
var requestTimeout = 1000 * 2;  // 2 seconds
var rotation = 0;
var loadingAnimation = new LoadingAnimation();

// Legacy support for pre-event-pages.
var oldChromeVersion = !chrome.runtime;
var requestTimerId;

function getSqlexUrl(forumName) {
	var url = (window.navigator.language == "ru") ? chrome.i18n.getMessage("sqlexcheck_url_ru") : chrome.i18n.getMessage("sqlexcheck_url_en");
	if (forumName == "L") {
		return url + "/forum/Lforum.php";
	}
	if (forumName == "R") {
		return url + "/forum/forum.php";
	}
	return url + "/";
}
/*
// Identifier used to debug the possibility of multiple instances of the
// extension making requests on behalf of a single user.
function getInstanceId() {
  if (!localStorage.hasOwnProperty("instanceId"))
    localStorage.instanceId = 'gmc' + parseInt(Date.now() * Math.random(), 10);
  return localStorage.instanceId;
}
*/
function getFeedUrl(forumName) {
  // "zx" is a Gmail query parameter that is expected to contain a random
  // string and may be ignored/stripped.
  //return getGmailUrl() + "feed/atom?zx=" + encodeURIComponent(getInstanceId());
  return getSqlexUrl(forumName);
}

function isSqlexUrl(url, forumName) {
	// Return whether the URL starts with the Sql-ex prefix.
	return url.indexOf(getSqlexUrl(forumName)) == 0;
}

// A "loading" animation displayed while we wait for the first response from
// Sql-ex. This animates the badge text with a dot that cycles from left to right.
function LoadingAnimation() {
	this.timerId_ = 0;
	this.maxCount_ = 8;  // Total number of states in animation
	this.current_ = 0;  // Current state
	this.maxDot_ = 4;  // Max number of dots in animation
}

LoadingAnimation.prototype.paintFrame = function() {
	var text = "";
	for (var i = 0; i < this.maxDot_; i++) {
		text += (i == this.current_) ? "." : " ";
	}
	if (this.current_ >= this.maxDot_)
		text += "";

	chrome.browserAction.setBadgeText({text:text});
	this.current_++;
	if (this.current_ == this.maxCount_)
		this.current_ = 0;
}

LoadingAnimation.prototype.start = function() {
	if (this.timerId_)
		return;

	var self = this;
	this.timerId_ = window.setInterval(function() {
		self.paintFrame();
	}, 100);
}

LoadingAnimation.prototype.stop = function() {
	if (!this.timerId_)
		return;

	window.clearInterval(this.timerId_);
	this.timerId_ = 0;
}

function updateIcon() {
	if (!localStorage.hasOwnProperty('unreadCountL') && !localStorage.hasOwnProperty('unreadCountR')) {
		chrome.browserAction.setIcon({path:"images/sqlex_not_logged_in_blue.png"});
		chrome.browserAction.setBadgeBackgroundColor({color:[0, 149, 231, 230]});
		// 190, 190, 190, 230 // gray
		// 0, 149, 231, 230 // blue
		chrome.browserAction.setBadgeText({text:"?"});
	} else {
		chrome.browserAction.setIcon({path: "images/sqlex_logged_in.png"});
		chrome.browserAction.setBadgeBackgroundColor({color:[200, 72, 37, 255]});
		//208, 0, 24, 255 // red
		//200, 72, 37, 255 // orange
		var unreadCount = 0;
		if (localStorage.hasOwnProperty('forumSelected') && localStorage.forumSelected != "undefined") {
			var forumSelected = localStorage.forumSelected;
		}
		else {
			var forumSelected = "B";
		}

		if (localStorage.hasOwnProperty('unreadCountL') && (forumSelected == "L" || forumSelected == "B")) {
			unreadCount += Number(localStorage.unreadCountL);
		}
		if (localStorage.hasOwnProperty('unreadCountR') && (forumSelected == "R" || forumSelected == "B")) {
			unreadCount += Number(localStorage.unreadCountR);
		}
		chrome.browserAction.setBadgeText({
			text: unreadCount != 0 ? unreadCount >= 10000 ? "..." : String(unreadCount) : ""
		});
	}
}

function scheduleRequest() {
	console.log('scheduleRequest');
	var randomness = Math.random() * 2;
	var exponent = Math.pow(2, localStorage.requestFailureCount / 2 || 0);
	var multiplier = Math.max(randomness * exponent, 1);
	var delay = Math.min(multiplier * pollIntervalMin, pollIntervalMax);
	delay = Math.round(delay);
	console.log('Scheduling for: ' + delay);

	if (oldChromeVersion) {
		if (requestTimerId) {
			window.clearTimeout(requestTimerId);
		}
		requestTimerId = window.setTimeout(onAlarm, delay*60*1000);
	} else {
		console.log('Creating alarm');
		// Use a repeating alarm so that it fires again if there was a problem
		// setting the next alarm.
		chrome.alarms.create('refresh', {periodInMinutes: delay});
	}
}

// ajax stuff
function startRequest(params) {
	// Schedule request immediately. We want to be sure to reschedule, even in the
	// case where the extension process shuts down while this request is
	// outstanding.
	if (params && params.scheduleRequest) scheduleRequest();

	function stopLoadingAnimation() {
		if (params && params.showLoadingAnimation) loadingAnimation.stop();
	}

	if (params && params.showLoadingAnimation)
		loadingAnimation.start();

	getForumCount(
		function(count) {
			stopLoadingAnimation();
			updateUnreadCount(count, "L");
		},
		function() {
			stopLoadingAnimation();
			delete localStorage.unreadCountL;
			updateIcon();
		},
		"L"
	);

	getForumCount(
		function(count) {
			stopLoadingAnimation();
			updateUnreadCount(count, "R");
		},
		function() {
			stopLoadingAnimation();
			delete localStorage.unreadCountR;
			updateIcon();
		},
		"R"
	);
}

function getForumCount(onSuccess, onError, forumName) {
	var xhr = new XMLHttpRequest();
	var abortTimerId = window.setTimeout(function() {
		xhr.abort();  // synchronously calls onreadystatechange
	}, requestTimeout);

	function handleSuccess(count) {
		localStorage.requestFailureCount = 0;
		window.clearTimeout(abortTimerId);
		if (onSuccess)
			onSuccess(count);
	}

	var invokedErrorCallback = false;
	function handleError() {
		++localStorage.requestFailureCount;
		window.clearTimeout(abortTimerId);
		if (onError && !invokedErrorCallback)
			onError();
		invokedErrorCallback = true;
	}

	try {
		xhr.onreadystatechange = function() {
			if (xhr.readyState != 4)
				return;

			if (xhr.status == 200) {
				if (/\[new\]/g.test(xhr.responseText) ) {
					handleSuccess(xhr.responseText.match(/\[new\]/g).length);
					return;
				}
				else {
					if (!/<input\s[^>]*?\bname="(login|psw)"[^>]*>/.test(xhr.responseText) ) {
						handleSuccess("0");
						return;
					}
				}
			}

			handleError();
		};

		xhr.onerror = function(error) {
			handleError();
		};

		xhr.open("GET", getFeedUrl(forumName), true);
		xhr.send(null);
	} catch(e) {
		console.error(chrome.i18n.getMessage("sqlexcheck_exception", e));
		handleError();
	}
}
/*
function gmailNSResolver(prefix) {
	if(prefix == 'gmail') {
		return 'http://purl.org/atom/ns#';
	}
}
*/
function updateUnreadCount(count, forumName) {
	if (forumName == "L") {
		var changed = localStorage.unreadCountL != count;
		localStorage.unreadCountL = count;
	}
	else {
		var changed = localStorage.unreadCountR != count;
		localStorage.unreadCountR = count;
	}
	updateIcon();
	// for not to animate twice (for Lforum.php and forum.php)
	// we animate only forum.php (it updates later than Lforum.php)
	if (changed && forumName != "L")
		animateFlip();
}

function ease(x) {
	return (1-Math.sin(Math.PI/2+x*Math.PI))/2;
}

function animateFlip() {
	rotation += 1/animationFrames;
	drawIconAtRotation();

	if (rotation <= 1) {
		setTimeout(animateFlip, animationSpeed);
	} else {
		rotation = 0;
		updateIcon();
	}
}

function drawIconAtRotation() {
	canvasContext.save();
	canvasContext.clearRect(0, 0, canvas.width, canvas.height);
	canvasContext.translate(
			Math.ceil(canvas.width/2),
			Math.ceil(canvas.height/2));
	canvasContext.rotate(2*Math.PI*ease(rotation));
	canvasContext.drawImage(loggedInImage,
			-Math.ceil(canvas.width/2),
			-Math.ceil(canvas.height/2));
	canvasContext.restore();

	chrome.browserAction.setIcon({imageData:canvasContext.getImageData(0, 0,
			canvas.width,canvas.height)});
}

function onInit() {
	console.log('onInit');
	localStorage.requestFailureCount = 0;  // used for exponential backoff
	startRequest({scheduleRequest:true, showLoadingAnimation:true});
	if (!oldChromeVersion) {
		// TODO(mpcomplete): We should be able to remove this now, but leaving it
		// for a little while just to be sure the refresh alarm is working nicely.
		chrome.alarms.create('watchdog', {periodInMinutes:5});
	}
}

function onAlarm(alarm) {
	console.log('Got alarm', alarm);
	// |alarm| can be undefined because onAlarm also gets called from
	// window.setTimeout on old chrome versions.
	if (alarm && alarm.name == 'watchdog') {
		onWatchdog();
	} else {
		startRequest({scheduleRequest:true, showLoadingAnimation:false});
	}
}

function onWatchdog() {
	chrome.alarms.get('refresh', function(alarm) {
		if (alarm) {
			console.log('Refresh alarm exists. Yay.');
		} else {
			console.log('Refresh alarm doesn\'t exist!? ' +
						'Refreshing now and rescheduling.');
			startRequest({scheduleRequest:true, showLoadingAnimation:false});
		}
	});
}

if (oldChromeVersion) {
	updateIcon();
	onInit();
} else {
	chrome.runtime.onInstalled.addListener(onInit);
	chrome.alarms.onAlarm.addListener(onAlarm);
}

var filters = {
	// TODO(aa): Cannot use urlPrefix because all the url fields lack the protocol
	// part. See crbug.com/140238.
	url: [{urlContains: getSqlexUrl().replace(/^https?\:\/\//, '')}]
};

function onNavigate(details) {
	if (details.url && isSqlexUrl(details.url, "")) {
		console.log('Recognized sql-ex navigation to: ' + details.url + '.' +
					'Refreshing count...');
		startRequest({scheduleRequest:false, showLoadingAnimation:false});
	}
}
if (chrome.webNavigation && chrome.webNavigation.onDOMContentLoaded &&
		chrome.webNavigation.onReferenceFragmentUpdated) {
	chrome.webNavigation.onDOMContentLoaded.addListener(onNavigate, filters);
	chrome.webNavigation.onReferenceFragmentUpdated.addListener(
		onNavigate, filters);
} else {
	chrome.tabs.onUpdated.addListener(function(_, details) {
		onNavigate(details);
	});
}

if (chrome.runtime && chrome.runtime.onStartup) {
	chrome.runtime.onStartup.addListener(function() {
		console.log('Starting browser... updating icon.');
		startRequest({scheduleRequest:false, showLoadingAnimation:false});
		updateIcon();
	});
} else {
	// This hack is needed because Chrome 22 does not persist browserAction icon
	// state, and also doesn't expose onStartup. So the icon always starts out in
	// wrong state. We don't actually use onStartup except as a clue that we're
	// in a version of Chrome that has this problem.
	chrome.windows.onCreated.addListener(function() {
		console.log('Window created... updating icon.');
		startRequest({scheduleRequest:false, showLoadingAnimation:false});
		updateIcon();
	});
}