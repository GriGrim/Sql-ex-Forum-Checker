/*
 * Copyright (c) 2016 Danila Chebykin.
 * All rights reserved.
 * Use of this source code is governed by a BSD license.
 */

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
	var domain = (localStorage.hasOwnProperty("domain")) ? localStorage["domain"] : "www.";
	switch(forumName) {
		case "L":
			return "http://" + domain + url + "/forum/Lforum.php";
			break;
		case "R":
			return "http://" + domain + url + "/forum/forum.php";
			break;
		case "JSON":
			return url + "/mobil/extension.php";
			break;
		default:
			return "http://" + domain + url + "/";
			break;
	}
}

function getFeedUrl(domain) {
	return "http://" + domain + getSqlexUrl("JSON");
}

function isSqlexUrl(url) {
	// Return whether the URL starts with the Sql-ex prefix.
	return url.indexOf(getSqlexUrl("")) == 0;
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
	if (
		   !localStorage.hasOwnProperty('DML')
		&& !localStorage.hasOwnProperty('DMLA')
		&& !localStorage.hasOwnProperty('L')
		&& !localStorage.hasOwnProperty('LA')
		&& !localStorage.hasOwnProperty('O')
		&& !localStorage.hasOwnProperty('OA')
		&& !localStorage.hasOwnProperty('Other')
		&& !localStorage.hasOwnProperty('R')
		&& !localStorage.hasOwnProperty('RA')
	) {
		chrome.browserAction.setIcon({path:"images/sqlex_not_logged_in_blue.png"});
		chrome.browserAction.setBadgeBackgroundColor({color:[0, 149, 231, 230]});
		// 190, 190, 190, 230 // gray // #bebebe
		// 0, 149, 231, 230 // blue // #0095e7
		chrome.browserAction.setBadgeText({text:"?"});
	} else {
		chrome.browserAction.setIcon({path: "images/sqlex_logged_in.png"});
		chrome.browserAction.setBadgeBackgroundColor({color:[200, 72, 37, 255]});
		//208, 0, 24, 255 // red // #d00018
		//200, 72, 37, 255 // orange // #c84825
		var unreadCount = 0;
		if (localStorage.hasOwnProperty('forumSelected') && localStorage.forumSelected != "undefined" && localStorage.forumSelected != "B") {
			var forumSelected = localStorage.forumSelected;
			switch(forumSelected) {
				case "L":
				case "R":
					forumSelected = "|" + forumSelected + "|";
					localStorage.forumSelected = forumSelected;
					break;
				default:
					break;
			}
		}
		else {
			var forumSelected = "|DML||L||O||Other||R|";
			localStorage.forumSelected = forumSelected;
		}

		if (localStorage.hasOwnProperty('DML') && forumSelected.indexOf("|DML|") != -1) {
			unreadCount += Number(localStorage.DML);
		}
		if (localStorage.hasOwnProperty('DMLA') && forumSelected.indexOf("|DMLA|") != -1 && forumSelected.indexOf("|DML|") == -1) {
			unreadCount += Number(localStorage.DMLA);
		}
		if (localStorage.hasOwnProperty('L') && forumSelected.indexOf("|L|") != -1) {
			unreadCount += Number(localStorage.L);
		}
		if (localStorage.hasOwnProperty('LA') && forumSelected.indexOf("|LA|") != -1 && forumSelected.indexOf("|L|") == -1) {
			unreadCount += Number(localStorage.LA);
		}
		if (localStorage.hasOwnProperty('O') && forumSelected.indexOf("|O|") != -1) {
			unreadCount += Number(localStorage.O);
		}
		if (localStorage.hasOwnProperty('OA') && forumSelected.indexOf("|OA|") != -1 && forumSelected.indexOf("|O|") == -1) {
			unreadCount += Number(localStorage.OA);
		}
		if (localStorage.hasOwnProperty('Other') && forumSelected.indexOf("|Other|") != -1) {
			unreadCount += Number(localStorage.Other);
		}
		if (localStorage.hasOwnProperty('R') && forumSelected.indexOf("|R|") != -1) {
			unreadCount += Number(localStorage.R);
		}
		if (localStorage.hasOwnProperty('RA') && forumSelected.indexOf("|RA|") != -1 && forumSelected.indexOf("|R|") == -1) {
			unreadCount += Number(localStorage.RA);
		}
		chrome.browserAction.setBadgeText({
			text: unreadCount != 0 ? unreadCount >= 10000 ? "..." : String(unreadCount) : ""
		});
	}
}

function scheduleRequest() {
	//console.log('scheduleRequest');
	var randomness = Math.random() * 2;
	var exponent = Math.pow(2, localStorage.requestFailureCount / 2 || 0);
	var multiplier = Math.max(randomness * exponent, 1);
	var delay = Math.min(multiplier * pollIntervalMin, pollIntervalMax);
	delay = Math.round(delay);
	//console.log('Scheduling for: ' + delay);

	if (oldChromeVersion) {
		if (requestTimerId) {
			window.clearTimeout(requestTimerId);
		}
		requestTimerId = window.setTimeout(onAlarm, delay*60*1000);
	} else {
		//console.log('Creating alarm');
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
			updateUnreadCount(count);
			updateIcon();
		},
		function() {
			stopLoadingAnimation();
			deleteUnreadCount();
			updateIcon();
		}
	);
}

function getForumCount(onSuccess, onError) {
	var xhr = new XMLHttpRequest();
	var domains = ["www.", ""];
	var domain;
	var currentDomainNum = -1;

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

	function tryNextUrl() {
		var nextUrl;
		currentDomainNum += 1;
		if (currentDomainNum < domains.length) {
			if (!localStorage.hasOwnProperty("domain")) {
				domain = domains[currentDomainNum];
			}
			else {
				domain = localStorage["domain"];
			}
			nextUrl = getFeedUrl(domain);
			xhr._domain = domain;
			xhr.open("GET", nextUrl, true);
			xhr.send(null);
		}
	}

	try {
		xhr.onreadystatechange = function() {
			if (xhr.readyState != 4)
				return;

			if (xhr.status == 200) {
				try {
					var response = JSON.parse(xhr.responseText);
					if (!response.ERROR) {
						localStorage["domain"] = this._domain;

						var selectRating = response.selectRating;

						var selectObligatory = (selectRating) ? selectRating.filter(function(p) { return p.type === "obligatorySelect" }) : undefined;
						var selectRatingLen = (selectObligatory) ? selectObligatory.length : 0;
						var selectRatingAuthorLen = (selectObligatory) ? selectObligatory.filter(function(p) { return p.author === true }).length : 0;

						var selectOptional = (selectRating) ? selectRating.filter(function(p) { return p.type === "optionalSelect" }) : undefined;
						var selectOptionalLen = (selectOptional) ? selectOptional.length : 0;
						var selectOptionalAuthorLen = (selectOptional) ? selectOptional.filter(function(p) { return p.author === true }).length : 0;

						var selectLearning = response.selectLearning;
						var selectLearningLen = (selectLearning) ? selectLearning.length : 0;
						var selectLearningAuthorLen = (selectLearning) ? selectLearning.filter(function(p) { return p.author === true }).length : 0;

						var other = response.Other;
						var otherLen = (other) ? other.length : 0;

						var dml = response.DML;
						var dmlLen = (dml) ? dml.length : 0;
						var dmlAuthorLen = (dml) ? dml.filter(function(p) { return p.author === true }).length : 0;

						var count = {
							L    : selectLearningLen,
							LA   : selectLearningAuthorLen,
							R    : selectRatingLen,
							RA   : selectRatingAuthorLen,
							O    : selectOptionalLen,
							OA   : selectOptionalAuthorLen,
							Other: otherLen,
							DML  : dmlLen,
							DMLA : dmlAuthorLen
						};

						handleSuccess(count);
						return;
					}
					else {
						localStorage.removeItem("domain");
						tryNextUrl();
					}
				} catch(e) {
					console.error(e);
					//alert(e); //error in the above string(in this case,yes)!
				}
			}

			handleError();
		};

		xhr.onerror = function(error) {
			handleError();
		};

		tryNextUrl();
	} catch(e) {
		console.error(chrome.i18n.getMessage("sqlexcheck_exception", e));
		handleError();
	}
}

function updateUnreadCount(count) {
	for (var i in count) {
		localStorage[i] = count[i];
	}
}

function deleteUnreadCount() {
	for (var attr in localStorage){
		if (attr != 'forumSelected' && attr != "requestFailureCount") {
			localStorage.removeItem(attr);
		}
	}
}

function onInit() {
	localStorage.requestFailureCount = 0;  // used for exponential backoff
	startRequest({scheduleRequest:true, showLoadingAnimation:true});
	if (!oldChromeVersion) {
		// TODO(mpcomplete): We should be able to remove this now, but leaving it
		// for a little while just to be sure the refresh alarm is working nicely.
		chrome.alarms.create('watchdog', {periodInMinutes:5});
	}
}

function onAlarm(alarm) {
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
		if (!alarm) {
			//console.log('Refresh alarm doesn\'t exist!? ' +
			//			'Refreshing now and rescheduling.');
			startRequest({scheduleRequest:true, showLoadingAnimation:false});
		} else {
			//console.log('Refresh alarm exists. Yay.');
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
	url: [{urlContains: getSqlexUrl("").replace(/^https?\:\/\//, '')}]
};

function onNavigate(details) {
	if (details.url && isSqlexUrl(details.url)) {
		//console.log('Recognized sql-ex navigation to: ' + details.url + '.' +
		//			'Refreshing count...');
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
		//console.log('Starting browser... updating icon.');
		startRequest({scheduleRequest:false, showLoadingAnimation:false});
		updateIcon();
	});
} else {
	// This hack is needed because Chrome 22 does not persist browserAction icon
	// state, and also doesn't expose onStartup. So the icon always starts out in
	// wrong state. We don't actually use onStartup except as a clue that we're
	// in a version of Chrome that has this problem.
	chrome.windows.onCreated.addListener(function() {
		//console.log('Window created... updating icon.');
		startRequest({scheduleRequest:false, showLoadingAnimation:false});
		updateIcon();
	});
}