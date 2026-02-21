/* global QUnit */
QUnit.config.autostart = false;

sap.ui.getCore().attachInit(function () {
	"use strict";

	sap.ui.require([
		"cos/cmds/qmc/cmdsqmc/test/unit/AllTests"
	], function () {
		QUnit.start();
	});
});
