var background = chrome.extension.getBackgroundPage();
var gray = "#d8d8d8";
var forumList = ["DML", "DMLA", "L", "LA", "O", "OA", "Other", "R", "RA"];

// Restores number of unread topics from localStorage
function restore_data() {
	var count;
	var forumName;
	for (var i in forumList) {
		forumName = forumList[i];
		count = document.getElementById(forumName);
		count.innerHTML = (localStorage.hasOwnProperty(forumName) ? localStorage[forumName] : "—");
		if (localStorage[forumName] == 0) { count.style.color = gray; }
	}
}

function open_tab(forumName) {
	var win = window.open(background.getSqlexUrl(forumName), '_blank');
	win.focus();
	window.close();
}

function refresh_data() {
	background.startRequest({scheduleRequest:true, showLoadingAnimation:true});
	window.setTimeout(restore_data, 1000); // delay 1 second
}

function open_options() {
	chrome.tabs.create({'url':'options.html', 'selected':true});
}

function close_popup() {
	window.close();
}

function init() {
	document.getElementById('LforumInfo').onclick = function() {open_tab("L");}
	document.getElementById('RforumInfo').onclick = function() {open_tab("R");}
	document.getElementById('OforumInfo').onclick = function() {open_tab("R");}
	document.getElementById('DMLforumInfo').onclick = function() {open_tab("R");}
	document.getElementById('OtherforumInfo').onclick = function() {open_tab("L");}
	document.querySelector('#refresh').addEventListener('click', refresh_data);
	document.querySelector('#options').addEventListener('click', open_options);
	document.querySelector('#close').addEventListener('click', close_popup);
}

document.addEventListener('DOMContentLoaded', function () {
	restore_data();
	// if user is not logged in we open the site
	for (var i in forumList) {
		// if there is as least one value, then do nothing
		if (localStorage.hasOwnProperty(forumList[i])) { return; }
	}
	open_tab("");
});
window.onload = function(){init();};