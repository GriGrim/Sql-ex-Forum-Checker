var background = chrome.extension.getBackgroundPage();

// Restores number of unread topics from localStorage
function restore_data() {
	console.log('restore data');
	var countL = document.getElementById("countL");
	if (localStorage.hasOwnProperty('unreadCountL')) {
		countL.innerHTML = localStorage.unreadCountL;
	}
	else {
		countL.innerHTML = "—";
	}
	var countR = document.getElementById("countR");
	if (localStorage.hasOwnProperty('unreadCountR')) {
		countR.innerHTML = localStorage.unreadCountR;
	}
	else {
		countR.innerHTML = "—";
	}
}

function open_tab(forumName) {
	chrome.tabs.getAllInWindow(undefined, function(tabs) {
		for (var i = 0, tab; tab = tabs[i]; i++) {
			if (tab.url && background.isSqlexUrl(tab.url, forumName)) {
				console.log('Found sql-ex tab: ' + tab.url + '. ' +
							'Focusing and refreshing count...');
				chrome.tabs.update(tab.id, {selected: true});
				background.startRequest({scheduleRequest:false, showLoadingAnimation:false});
				return;
			}
		}
		console.log('Could not find sql-ex tab. Creating one...');
		var win = window.open(background.getSqlexUrl(forumName), '_blank');
		win.focus();
		window.close();
	});
}

function refresh_data() {
	console.log('refresh data');
	background.startRequest({scheduleRequest:true, showLoadingAnimation:true});
	window.setTimeout(restore_data, 1000); // delay 1 second
}

function open_options() {
	console.log('open options');
	chrome.tabs.create({'url':'options.html', 'selected':true});
}

function close_popup() {
	console.log('close popup');
	window.close();
}

function init() {
	document.getElementById('LforumInfo').onclick = function() {open_tab("L");}
	document.getElementById('RforumInfo').onclick = function() {open_tab("R");}
	document.querySelector('#refresh').addEventListener('click', refresh_data);
	document.querySelector('#options').addEventListener('click', open_options);
	document.querySelector('#close').addEventListener('click', close_popup);
}

document.addEventListener('DOMContentLoaded', function () {
	restore_data();
	// if user is not logged in we open the site
	if (!localStorage.hasOwnProperty('unreadCountL') && !localStorage.hasOwnProperty('unreadCountR')) {
		open_tab("");
	}
});
window.onload = function(){init();};