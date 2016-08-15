var background = chrome.extension.getBackgroundPage();

// Restores select box state to saved value from localStorage.
function restore_options() {
	var forum = localStorage["forumSelected"];
	if (!forum) {
		return;
	}
	var elements = document.getElementsByClassName("cb");
	for (var i = 0, len = elements.length; i < len; i++) {
		var child = elements[i];
		if (forum.indexOf("|" + child.value + "|") != -1) {
			child.checked = true;
		}
		else {
			child.checked = false;
		}
	}
}

function init() {
	document.getElementsByTagName("title")[0].innerText = chrome.i18n.getMessage("sqlexcheck_options_title") + ' - ' + chrome.i18n.getMessage("sqlexcheck_name");
	var elements = document.getElementsByClassName('cb');
	for (var i = 0, len = elements.length; i < len; i++) {
		elements[i].onclick = function() {
			if (this.checked) {
				if (localStorage["forumSelected"].indexOf("|" + this.value + "|") == -1) {
					localStorage["forumSelected"] += "|" + this.value + "|";
				}
			}
			else {
				localStorage["forumSelected"] = localStorage["forumSelected"].replace("|" + this.value + "|", "");
			}
			background.startRequest({scheduleRequest:true, showLoadingAnimation:true});
			window.setTimeout(restore_data, 1000); // delay 1 second
		};
	}
}

document.addEventListener('DOMContentLoaded', restore_options);
window.onload = init;