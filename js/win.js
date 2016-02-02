var winScreen;

var win = function(reason) {
	if (levelWasCleared) {
		return;
	}
	localStorage.setItem('level_' + gameState.getLevelId(), "solved");
	winScreen.fadeIn(400);
	levelWasCleared = true;

	//$('#win-screen .icon').slideDown();
	//

	var messages = ["You win!", "Great job!", "Congratulations!"];
	var randomMessage = messages[Math.floor(3 * Math.random())];

	$('#win-congratulation').text(randomMessage);

	// TODO: taky popsat, jak jsem to znicil

	var text = gameState.getLevel().victoryText;
	if (reason) {
		text += "<br><br><p>Victory Condition: <i>" + reason + "</i></p>";
	}
	$('#win-message').html(text);

	if (!areThereMoreLevels()) {
		// game finished
		$('#win-message').append("<br><br>You mastered all the lessons of The Deadlock Empire. Thank you for playing!");
		$('#win-next-level').hide();
	} else {
		$('#win-next-level').show();
	}
};

var areThereMoreLevels = function() {
	return findNextLevelInCampaign(gameState.getLevelId()) != null;
};

$(function() {
	winScreen = $('#win-screen');
	winScreen.css({display: 'none'});

	$('#dismiss-win').click(function() {
		winScreen.fadeOut(300);
		redraw();  // shows 'next challenge' button
	});

	// TODO: what if we win the last level?
	$('#win-next-level').click(goToNextLevel);

	$('#win-go-to-menu').click(function() {
		returnToMainMenu();
		winScreen.fadeOut(300);
	});
});
