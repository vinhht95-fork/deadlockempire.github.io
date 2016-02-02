var moveToNextInstruction = function(threadState) {
	if (threadState.expanded) {
		threadState.programCounter[1]++;

		var program = gameState.getProgramOfThread(threadState.id);
		if (threadState.programCounter[1] >= program[threadState.programCounter[0]].minorInstructions.length) {
			threadState.expanded = false;
			threadState.programCounter[0]++;
			threadState.programCounter[1] = 0;
		}
	} else {
		threadState.expanded = false;
		threadState.programCounter[0]++;
		threadState.programCounter[1] = 0;
	}
};

var goToInstruction = function(threadState, line) {
	threadState.programCounter = [line, 0];
};

var Instruction = function(code) {
	this.code = code;
	this.tooltip = "This statement does nothing and merely fills up space.";
	this.execute = function(threadState, globalState) {
		moveToNextInstruction(threadState);
	};
};

var FlavorInstruction = function(flavorText) {
	this.code = "<i>" + flavorText + "</i>;";
	this.tooltip = "This statement does nothing. It is part of the business logic and does not affect parallelism. You may consider it thread-safe.";
	this.execute = function(threadState, globalState) {
		moveToNextInstruction(threadState);
	};
};

var FailureInstruction = function() {
	this.code = "<i>failure-statement</i>;";
	this.tooltip = "If you execute this statement, you will win this level.";
	this.execute = function(threadState, globalState) {
		win("You executed a failure instruction.");
	};
};

var CriticalSectionInstruction = function() {
	this.isCriticalSection = true;
	this.code = "<span class='critical-section'>critical_section</span>();";
	this.tooltip = "If two threads are about to execute a Critical Section Instruction at the same time, you win the level.";
	this.execute = function (threadState, globalState) {
		moveToNextInstruction(threadState);
	};
};

var WinningInstruction = function(code) {
	this.code = code;
	this.execute = function(threadState, globalState) {
		win("You have executed the Winning Instruction.");
	};
};

var findMatchingInstructionIndex = function(program, name, type) {
	for (var i = 0; i < program.length; i++) {
		var instruction = program[i];
		if ((instruction instanceof type) && instruction.name == name) {
			return i;
		}
	}
	fail("Failed to find matching instruction", program, name, type);
	return 0;
};

var IfInstruction = function(expression, name) {
	this.code = "<span class='keyword'>if</span> (" + expression.code + ") {";
	this.name = name;
	this.tooltip = "The \"if\" statement evaluates an expression. If it's true, the specified statements are executed. Otherwise, they are skipped.";
	this.isBlocking = function(threadState, globalState) {
		return (expression.isBlocking && expression.isBlocking(threadState, globalState));
	}
	this.execute = function(threadState, globalState, threadProgram) {
		if (expression.evaluate(threadState, globalState)) {
			moveToNextInstruction(threadState);  // goto true branch
		} else {
			// Condition is false, jump to matching EndIf.
			var matchingEndIf = findMatchingInstructionIndex(threadProgram, name, EndIfInstruction);
			goToInstruction(threadState, matchingEndIf);
		}
	};
};

var EndIfInstruction = function(name) {
	this.code = "}";
	this.tooltip = "This is the end of a simple \"if\" statement.";
	this.name = name;
	this.execute = function(threadState) {
		moveToNextInstruction(threadState);
	};
};

var IfLongInstruction = function(expression, name) {
	this.code = "<span class='keyword'>if</span> (" + expression.code + ") {";
	this.name = name;
	this.tooltip = "The \"if\" statement evaluates an expression. If it's true, the specified statements are executed. Otherwise, the \"else\" statements are executed.";
	this.isBlocking = function(threadState, globalState) {
		return (expression.isBlocking && expression.isBlocking(threadState, globalState));
	}
	this.execute = function(threadState, globalState, threadProgram) {
		if (expression.evaluate(threadState, globalState)) {
			moveToNextInstruction(threadState);  // goto true branch
		} else {
			// false -> move 1 instruction after matching 'else'
			var matchingElse = findMatchingInstructionIndex(threadProgram, name, ElseInstruction);
			goToInstruction(threadState, matchingElse + 1);
		}
	};
};

var ElseInstruction = function(name) {
	this.code = "} <span class='keyword'>else</span> {";
	this.name = name;
	this.tooltip = "This is part of an \"if/else\" statement.";
	this.execute = function(threadState, globalState, threadProgram) {
		var matchingEndIfLong = findMatchingInstructionIndex(threadProgram, name, EndIfLongInstruction);
		goToInstruction(threadState, matchingEndIfLong);
	};
};

var EndIfLongInstruction = function(name) {
	this.code = "}";
	this.tooltip = "This is the end of a complex \"if\" statement.";
	this.name = name;
	this.execute = function(threadState) {
		moveToNextInstruction(threadState);
	};
};


var ExpandableInstruction = function(code, minorInstructions) {
	this.code = code;
	this.minorInstructions = minorInstructions;
	this.tooltip = "This statement is not atomic and can be expanded into several minor statements that are atomic.";
	this.execute = function(threadState, globalState, threadProgram) {
		console.assert(!threadState.expanded);
		threadState.expanded = true;
		for (var i = 0; i < minorInstructions.length; i++) {
			if (minorInstructions[i].isBlocking && minorInstructions[i].isBlocking(threadState, globalState)) {
				// Cannot execute this subinstruction. Break.
				break;
			}
			minorInstructions[i].execute(threadState, globalState, threadProgram);
		}
	};
};
var AtomicAssignmentToTemp = function (expression) {
	this.code = "temp = " + expression.code + ";";
	this.tooltip = "Evaluates the expression to the right and assigns it to the thread-local temporary variable on the left.";
	this.execute = function(threadState, globalState) {
		var value = expression.evaluate(threadState, globalState);
		threadState.temporaryVariableValue = value;
		moveToNextInstruction(threadState);
	};
};
var AtomicAssignmentFromTemp = function (name) {
	this.code = name + " = temp;";
	this.tooltip = "Moves the value from the thread-local temporary variable into the specified global variable.";
	this.execute = function(threadState, globalState) {
		globalState[name].value = threadState.temporaryVariableValue;
		moveToNextInstruction(threadState);
	};
};

var createAssignment = function(name, expression) {
	var minorInstructions = [
		new AtomicAssignmentToTemp(expression),
		new AtomicAssignmentFromTemp(name)
	];
	var v = new ExpandableInstruction(name + " = " + expression.code + ";", minorInstructions);
	v.tooltip = "[Expandable] Assigns the value of the right-side expression to the variable on the left. This operation is non-atomic.";
	return v;
};

var createIncrement = function(name) {
	var minorInstructions = [
		new AtomicAssignmentToTemp(new AdditionExpression(new VariableExpression(name), new LiteralExpression(1))),
		new AtomicAssignmentFromTemp(name)
	];
	var v = new ExpandableInstruction(name + "++;", minorInstructions);
	v.tooltip = "[Expandable] Increments the value of the variable by one. This operation is non-atomic. However, the function Interlocked.Increment is atomic.";
	return v;
};

var EmptyStatement = function() {
	this.code = ";";
	this.tooltip = "This statement does nothing.";
	this.execute = function(threadState, globalState) {
		moveToNextInstruction(threadState);
	};
};

var CommentInstruction = function(comment) {
	this.code = "<font color='Gray'>// " + comment + "</font>";
	this.tooltip = "This is a comment. It does nothing.";
	this.execute = function(threadState, globalState) {
		moveToNextInstruction(threadState);
	};
};

var WhileInstruction = function(expression, name, code) {
	this.code = code ? code : ("<span class='keyword'>while</span> (" + expression.code + ") {");
	this.name = name;
	this.tooltip = "Executes the statements in the loop body until the specified condition ceases to be true.";

	this.execute = function(threadState, globalState, threadProgram) {
		if (expression.evaluate(threadState, globalState)) {
			moveToNextInstruction(threadState);
		} else {
			// false -> move 1 instruction after matching EndWhile
			var matchingEndWhile = findMatchingInstructionIndex(threadProgram, name, EndWhileInstruction);
			goToInstruction(threadState, matchingEndWhile + 1);
		}
	};
};

var createOuterWhile = function() {
	return new WhileInstruction(new LiteralExpression(true), "__outerWhile");
}
var createOuterWhileEnd = function() {
	return new EndWhileInstruction("__outerWhile");
}

var EndWhileInstruction = function( name) {
	this.code = "}";
	this.tooltip = "Marks the end of a while loop.";
	this.name = name;
	this.execute = function(threadState, globalState, threadProgram) {
		// Jump back to start of matching 'while'.
		var matchingWhile = findMatchingInstructionIndex(threadProgram, name, WhileInstruction);
		goToInstruction(threadState, matchingWhile);
	};
};
