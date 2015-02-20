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
		if (child.value == forum) {
			child.checked = "true";
			break;
		}
	}
}

function init() {
	document.getElementsByTagName("title")[0].innerText = chrome.i18n.getMessage("sqlexcheck_options_title") + ' - ' + chrome.i18n.getMessage("sqlexcheck_name");
	var elements = document.getElementsByClassName('cb');
	for (var i = 0, len = elements.length; i < len; i++) {
		elements[i].onclick = function() {
			localStorage["forumSelected"] = this.value;
			background.animateFlip();
		};
	}
}

document.addEventListener('DOMContentLoaded', restore_options);
window.onload = init;