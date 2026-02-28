sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (Controller, MessageToast, MessageBox, Filter, FilterOperator) {
    "use strict";

    return Controller.extend("cos.cmds.qmc.cmdsqmc.controller.MainView", {
        onInit: function () {
            var oModel = this.getOwnerComponent().getModel();
            var oMessageManager = sap.ui.getCore().getMessageManager();

            if (oModel) {
                oModel.setDefaultBindingMode(sap.ui.model.BindingMode.TwoWay);

                // Link the OData model to the message processor
                oMessageManager.registerMessageProcessor(oModel);

                // Initialize models
                var oViewModel = new sap.ui.model.json.JSONModel({
                    isCreateMode: true,
                    hasData: false
                });
                this.getView().setModel(oViewModel, "ui");
                this.getView().setModel(new sap.ui.model.json.JSONModel({}), "fieldControl");

                // Register the view to the manager so fields can turn red
                oMessageManager.registerObject(this.getView(), true);
            }
        },

        onTemplateSelect: function (oEvent) {
            var sSelectedValue = oEvent.getParameter("value");
            this._loadTemplateData(sSelectedValue);

        },
        _loadTemplateData: function (sSelectedValue) {
            var oView = this.getView();
            var oModel = oView.getModel();
            var self = this;

            if (!sSelectedValue) {
                return;
            }

            oView.setBusy(true);

            oModel.read("/MaterialHeaderSet('" + sSelectedValue + "')", {
                urlParameters: {
                    "$expand": "to_Plants,to_Valuations,to_LongTexts"
                },
                success: function (oData) {
                    if (oData && oData.MatlType) {
                        // Now we have the material type, load config
                        self._loadFieldControl(oData.MatlType, sSelectedValue);
                    } else {
                        oView.setBusy(false);
                        sap.m.MessageBox.error("Material Type not found.");
                    }
                },
                error: function (oError) {
                    oView.setBusy(false);
                    // Log the error to console to see if it's still 501
                    console.error(oError);
                    sap.m.MessageBox.error("Backend Error: Ensure GET_EXPANDED_ENTITY is working for template " + sSelectedValue);
                }
            });
        },

        _loadFieldControl: function (sMatType, sTemplateMat) {
            var oModel = this.getView().getModel();
            var oView = this.getView();
            var oFieldControlModel = oView.getModel("fieldControl");

            oView.setBusy(true);

            oModel.read("/FieldConfigSet", {
                urlParameters: {
                    "$filter": "MatType eq '" + sMatType + "'"
                },
                success: function (oData) {

                    // HARD ERROR CHECK: No configuration results found
                    if (!oData.results || oData.results.length === 0) {
                        oView.setBusy(false);

                        // Clear any existing field control data
                        oFieldControlModel.setData({});

                        // Clear the UI model/Template path so the form stays hidden
                        this.getView().getModel("ui").setProperty("/hasData", false);
                        this.getView().byId("materialInput7").setValue("");

                        // Display a Hard Error Popup
                        sap.m.MessageBox.error("Configuration Error: No field control settings found for Material Type '" + sMatType + "'.", {
                            title: "Missing Configuration",
                            details: "The application cannot display the Template Material because the Field Config has not been maintained for this specific Material Type in the backend.",
                            onClose: function () {
                                // May need to add something here later
                            }
                        });
                        return; // Stop execution - do not load template data
                    }

                    // If configuration exists, proceed as normal
                    var oConfigMap = {};
                    oData.results.forEach(function (item) {
                        if (!oConfigMap[item.EntitySetName]) {
                            oConfigMap[item.EntitySetName] = {};
                        }
                        oConfigMap[item.EntitySetName][item.FieldName] = {
                            editable: (item.FieldOption === "REQ" || item.FieldOption === "OPT"),
                            required: (item.FieldOption === "REQ"),
                            visible: (item.FieldOption !== "HID")
                        };
                    });

                    oFieldControlModel.setData(oConfigMap);
                    oFieldControlModel.updateBindings(true);

                    // Now that config is loaded, safely load the template data
                    this._bindTemplateToView(sTemplateMat);

                    oView.setBusy(false);
                }.bind(this),
                error: function () {
                    oView.setBusy(false);
                    sap.m.MessageBox.show("Technical error retrieving field configuration.");
                }
            });
        },

        // Helper to perform the actual binding only after config check passes
        _bindTemplateToView: function (sTemplateMat) {
            var sPath = "/MaterialHeaderSet('" + sTemplateMat + "')";

            // Force the UI to lock immediately when we start the binding process
            this.getView().getModel("ui").setProperty("/hasData", true);

            this.getView().bindElement({
                path: sPath,
                parameters: {
                    expand: "to_Plants,to_Valuations,to_LongTexts"
                },
                events: {
                    dataReceived: function () {
                        // Keep this here as a safety measure for the final data arrival
                        this.getView().getModel("ui").setProperty("/hasData", true);
                    }.bind(this)
                }
            });
        },


        //*************************************//
        // Template Material Value Help Request
        //*************************************//
        onMaterialValueHelpRequest: function () {
            var oView = this.getView();
            if (!this._oSelectDialog) {
                this._oSelectDialog = sap.ui.xmlfragment(oView.getId(), "cos.cmds.qmc.cmdsqmc.view.fragments.MaterialValueHelp", this);
                oView.addDependent(this._oSelectDialog);
            }
            this._oSelectDialog.open();
        },

        onMatValueHelpSearch: function (oEvent) {
            var sValue = oEvent.getParameter("value");
            var oBinding = oEvent.getSource().getBinding("items");

            // Check if the 'clear' icon was pressed or if the search string is empty
            var bClearButtonPressed = oEvent.getParameter("clearButtonPressed");

            if (sValue && !bClearButtonPressed) {
                // Since backend DPC_EXT is bypassed in Client mode, 
                // we manually define the 3-field search here.
                var aFilters = [
                    new Filter("TemplateMat", FilterOperator.Contains, sValue),
                    new Filter("Maktg", FilterOperator.Contains, sValue),
                    new Filter("Mtart", FilterOperator.Contains, sValue)
                ];

                var oCombinedFilter = new Filter({
                    filters: aFilters,
                    and: false // 'false' creates an OR condition
                });

                oBinding.filter([oCombinedFilter]);
            } else {
                // Resets the list to show all items
                oBinding.filter([]);
            }
        },

        onMatValueConfirm: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            if (oSelectedItem) {
                var sMaterial = oSelectedItem.getBindingContext().getProperty("TemplateMat");
                this.getView().byId("materialInput7").setValue(sMaterial);
                this._loadTemplateData(sMaterial);
            }
        },

        //************************************************//
        // Generic Value Help Requests (for multiple fields)
        //***********************************************//
        onValueHelpRequest: function (oEvent) {
            var oInput = oEvent.getSource();
            this._oInputSource = oInput;
            var oView = this.getView();
            var oModel = oView.getModel();

            var sEntitySet = oInput.data("entitySet");
            var sTitle = oInput.data("title");
            var sKeyField = oInput.data("keyField");
            var sDescField = oInput.data("descField");
            var bClientSide = oInput.data("useClientSide") === "true";

            // Fresh fragment every time
            var oDialog = sap.ui.xmlfragment(oView.getId(), "cos.cmds.qmc.cmdsqmc.view.fragments.ValueHelpDialog", this);
            oView.addDependent(oDialog);
            oDialog.setTitle(sTitle);

            var oLocalModel = oView.getModel("localVH") || new sap.ui.model.json.JSONModel();
            if (!oView.getModel("localVH")) { oView.setModel(oLocalModel, "localVH"); }

            var oItemTemplate = new sap.m.ColumnListItem({
                cells: [
                    new sap.m.Text({ text: "{localVH>" + sKeyField + "}" }),
                    new sap.m.Text({ text: "{localVH>" + sDescField + "}" })
                ]
            });

            // Bind to JSON model ONLY (stops auto-OData-refresh)
            oDialog.bindAggregation("items", { path: "localVH>/" + sEntitySet, template: oItemTemplate });

            if (bClientSide && oLocalModel.getProperty("/" + sEntitySet)) {
                oDialog.open();
            } else {
                oDialog.setBusy(true);
                oDialog.open();
                oModel.read("/" + sEntitySet, {
                    success: function (oData) {
                        oLocalModel.setProperty("/" + sEntitySet, oData.results);
                        oDialog.setBusy(false);
                    },
                    error: function () { oDialog.setBusy(false); }
                });
            }
        },

        _bindDialogToLocal: function (sEntitySet, sKeyField, sDescField) {
            this._pValueHelpDialog.bindAggregation("items", {
                path: "localVH>/" + sEntitySet,
                template: new sap.m.ColumnListItem({
                    cells: [
                        new sap.m.Text({ text: "{localVH>" + sKeyField + "}" }),
                        new sap.m.Text({ text: "{localVH>" + sDescField + "}" })
                    ]
                })
            });
        },

        onValueHelpConfirm: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            var oInput = this._oInputSource; // This was set in onValueHelpRequest

            if (!oSelectedItem || !oInput) {
                oEvent.getSource().destroy();
                return;
            }

            // Get the Key and Description from the selected item's context
            // We use the JSON model 'localVH' which was bound in onValueHelpRequest
            var oContext = oSelectedItem.getBindingContext("localVH");
            var sKeyField = oInput.data("keyField");
            var sDescField = oInput.data("descField");

            var sKey = oContext.getProperty(sKeyField);
            var sDesc = oContext.getProperty(sDescField);

            // Update the technical value in the Input field
            oInput.setValue(sKey);

            // Update the Description field if a target ID was provided in CustomData
            var sTargetDescId = oInput.data("targetDescId");
            if (sTargetDescId) {
                var oDescInput = this.byId(sTargetDescId);
                if (oDescInput) {
                    oDescInput.setValue(sDesc);
                }
            }

            // Update the OData Model context so the change is sent to SAP
            var oBinding = oInput.getBinding("value");
            if (oBinding) {
                var sPath = oBinding.getPath();
                var oMainContext = oInput.getBindingContext(); // The OData context
                if (oMainContext) {
                    oMainContext.getModel().setProperty(sPath, sKey, oMainContext);
                }
            }

            // Cleanup the dialog fragment
            oEvent.getSource().destroy();
        },

        onValueHelpClose: function (oEvent) {
            oEvent.getSource().destroy();
        },

        onValueHelpSearch: function (oEvent) {
            var sValue = oEvent.getParameter("value");
            var oDialog = oEvent.getSource();
            var oInput = this._oInputSource;
            var oView = this.getView();
            var oModel = oView.getModel();

            var sEntitySet = oInput.data("entitySet");
            var sKeyField = oInput.data("keyField");
            var sDescField = oInput.data("descField");
            var bClientSide = oInput.data("useClientSide") === "true";

            if (bClientSide) {
                // Standard local filtering for cached JSON data
                var oBinding = oDialog.getBinding("items");
                var aFilters = [];
                if (sValue) {
                    aFilters.push(new sap.ui.model.Filter({
                        filters: [
                            new sap.ui.model.Filter(sKeyField, sap.ui.model.FilterOperator.Contains, sValue),
                            new sap.ui.model.Filter(sDescField, sap.ui.model.FilterOperator.Contains, sValue)
                        ],
                        and: false
                    }));
                }
                oBinding.filter(aFilters);
            } else {
                // SERVER SIDE: Using the 'search' parameter for IV_SEARCH_STRING
                oDialog.setBusy(true);

                var mParameters = {};
                if (sValue) {
                    // This triggers the 'search' logic in Gateway
                    // Resulting URL: .../EntitySet?search=xxx
                    mParameters["search"] = sValue;
                }

                oModel.read("/" + sEntitySet, {
                    urlParameters: mParameters,
                    success: function (oData) {
                        var oLocalModel = oView.getModel("localVH");
                        oLocalModel.setProperty("/" + sEntitySet, oData.results);
                        oDialog.setBusy(false);
                    },
                    error: function () {
                        oDialog.setBusy(false);
                    }
                });
            }
        },

        onValueHelpClosebackup: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            var oInput = this._oInputSource;

            if (oSelectedItem) {
                var sKey = oSelectedItem.getTitle();
                var sDesc = oSelectedItem.getDescription();

                // Update the Main Input (The technical key)
                oInput.setValue(sKey);

                // Update the Description Field via ID (targetDescId from your XML)
                var sTargetDescId = oInput.data("targetDescId");
                if (sTargetDescId) {
                    var oDescInput = this.byId(sTargetDescId);
                    if (oDescInput) {
                        oDescInput.setValue(sDesc);
                    }
                }

                // 3. Update the underlying OData Model context
                var oBinding = oInput.getBinding("value");
                if (oBinding) {
                    var sPath = oBinding.getPath();
                    var oContext = oInput.getBindingContext();
                    oContext.getModel().setProperty(sPath, sKey, oContext);
                }
            }
        },

        onReset: function () {
            var oView = this.getView();
            var oInput = oView.byId("materialInput7");

            MessageBox.confirm("This will clear all current data. Proceed?", {
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        // 1. Reset Master UI States
                        var oUiModel = oView.getModel("ui");
                        oUiModel.setProperty("/isCreateMode", true);
                        oUiModel.setProperty("/hasData", false);

                        // Clear Field Configuration
                        // This forces all fields back to read-only based on our new formatter logic
                        if (oView.getModel("fieldControl")) {
                            oView.getModel("fieldControl").setData({});
                        }

                        // Clear Input and Unbind
                        oInput.setValue("");
                        oView.unbindElement();

                        // Clear OData Messages (if any are hanging around)
                        sap.ui.getCore().getMessageManager().removeAllMessages();

                        // Force UI Refresh
                        oView.getModel().updateBindings(true);

                        MessageToast.show("Form reset and ready for new template.");
                    }
                }
            });
        },
        onCreateMaterial: function () {
            // Clear previous validation state
            sap.ui.getCore().getMessageManager().removeAllMessages();
            var oView = this.getView();
            var oModel = oView.getModel();

            // Force the UI to push changes to the Model buffer
            sap.ui.getCore().applyChanges();

            var oContext = oView.getBindingContext();
            if (!oContext) return;
            oView.setBusy(true);

            // Sanitation logic
            var fnSanitize = function (obj) {
                if (obj instanceof Array) return obj.map(fnSanitize);
                if (typeof obj === "object" && obj !== null) {
                    if (obj.results && Array.isArray(obj.results)) return obj.results.map(fnSanitize);
                    var newObj = {};
                    for (var key in obj) {
                        if (!key.startsWith("__") && obj[key] !== null && typeof obj[key] !== "undefined") {
                            newObj[key] = fnSanitize(obj[key]);
                        }
                    }
                    return newObj;
                }
                return obj;
            };

            // Get the updated Header Data
            var oPayload = fnSanitize(oContext.getObject());

            // Get the Plants Data 
            var oPlantsTable = oView.byId("TblPlantDetails");
            oPayload.to_Plants = oPlantsTable.getItems().map(function (oItem) {
                var oCtx = oItem.getBindingContext();
                return oCtx ? fnSanitize(oModel.getProperty(oCtx.getPath())) : null;
            }).filter(Boolean);

            // Get the Valuation Data 
            var oValTable = oView.byId("TblValuation");
            oPayload.to_Valuations = oValTable.getItems().map(function (oItem) {
                var oCtx = oItem.getBindingContext();
                return oCtx ? fnSanitize(oModel.getProperty(oCtx.getPath())) : null;
            }).filter(Boolean);

            // Structural Integrity
            oPayload.to_Plants = oPayload.to_Plants || [];
            oPayload.to_Valuations = oPayload.to_Valuations || [];
            oPayload.to_LongTexts = [];

            // Backend naming alignment
            oPayload.Material = "";
            delete oPayload.Material;
            delete oPayload.to_Longtexts;

            var oTabHeader = oView.byId("ITB_LongTexts");
            var aTabs = oTabHeader.getItems();

            oPayload.to_LongTexts = aTabs.map(function (oTab) {
                var oCtx = oTab.getBindingContext();
                if (!oCtx) return null;

                // Get the original data (including TextId and Tdtext)
                var oTextObj = fnSanitize(oModel.getProperty(oCtx.getPath()));

                // Update the Textline with the current value from the TextArea inside the tab
                var oTextArea = oTab.getContent()[0]; // The TextArea is the child of the Tab
                oTextObj.TextString = oTextArea.getValue();

                return oTextObj;
            }).filter(Boolean);

            // Create Call
            oModel.create("/MaterialHeaderSet", oPayload, {
                success: function (oData) {
                    oView.setBusy(false);

                    var sNewMaterial = oData.Material; // The generated number from SAP
                    // Flip the Master Switch to Lock the UI ---
                    this.getView().getModel("ui").setProperty("/isCreateMode", false);

                    MessageBox.success("Material " + sNewMaterial + " created successfully!", {
                        actions: ["Display Material", MessageBox.Action.OK],
                        emphasizedAction: "Display Material",
                        onClose: function (sAction) {
                            if (sAction === "Display Material") {
                                // Navigate to the display route (adjust 'display' to your route name)
                                this.getOwnerComponent().getRouter().navTo("display", {
                                    Material: sNewMaterial
                                });
                                //   } else {
                                // this.onReset(); // Clear the form for the next one
                            }
                        }.bind(this)
                    });
                }.bind(this),
                error: function (oError) {

                    oView.setBusy(false);

                    // With the correct backend target, we just need to wait a 
                    // split second for the framework's internal parser to finish.
                    setTimeout(function () {
                        var oBtn = this.byId("btnCreate");
                        this._getOutputMessagePopover().openBy(oBtn);
                    }.bind(this), 200);
                }.bind(this)
            });
        },
        _parseODataError: function (oError) {
            var aMessages = [];
            try {
                // SAP OData errors are usually stringified JSON in the .responseText or .message property
                var oResponse = JSON.parse(oError.responseText || oError.message);

                // If the backend returns the array directly or inside error.innererror.errordetails
                if (oResponse.error && oResponse.error.innererror && oResponse.error.innererror.errordetails) {
                    aMessages = oResponse.error.innererror.errordetails;
                } else if (Array.isArray(oResponse)) {
                    aMessages = oResponse;
                }
            } catch (e) {
                aMessages.push({
                    message: "An unexpected error occurred.",
                    type: "Error"
                });
            }
            return aMessages;
        },
        _showMessageDialog: function (aMessages) {
            var oMessageModel = new sap.ui.model.json.JSONModel(aMessages);

            var oMessageTemplate = new sap.m.MessageItem({
                type: "{type}",
                title: "{title}",
                description: "{description}"
            });

            var oMessageView = new sap.m.MessageView({
                items: {
                    path: "/",
                    template: oMessageTemplate
                }
            });

            oMessageView.setModel(oMessageModel);

            var oDialog = new sap.m.Dialog({
                title: "Test Run Results / Error Log",
                content: oMessageView,
                contentHeight: "50%",
                contentWidth: "50%",
                verticalScrolling: false,
                beginButton: new sap.m.Button({
                    text: "Close",
                    press: function () {
                        oDialog.close();
                    }
                })
            });

            this.getView().addDependent(oDialog);
            oDialog.open();
        },

        _getOutputMessagePopover: function () {
            if (!this._oMessagePopover) {
                this._oMessagePopover = new sap.m.MessagePopover({
                    items: {
                        path: "message>/",
                        template: new sap.m.MessageItem({
                            type: "{message>type}",
                            title: "{message>message}",
                            subtitle: "{message>additionalText}",
                            description: "{message>description}",
                            additionalText: "{message>additionalText}"
                        })
                    }
                });
                // set the message model to the popover 
                this._oMessagePopover.setModel(sap.ui.getCore().getMessageManager().getMessageModel(), "message");
                this.getView().addDependent(this._oMessagePopover);
            }
            return this._oMessagePopover;
        },
        _parseODataError: function (oError) {
            var aMessages = [];
            try {
                // SAP OData errors are usually stringified JSON in the .responseText or .message property
                var oResponse = JSON.parse(oError.responseText || oError.message);

                // If the backend returns the array directly or inside error.innererror.errordetails
                if (oResponse.error && oResponse.error.innererror && oResponse.error.innererror.errordetails) {
                    aMessages = oResponse.error.innererror.errordetails;
                } else if (Array.isArray(oResponse)) {
                    aMessages = oResponse;
                }
            } catch (e) {
                aMessages.push({
                    message: "An unexpected error occurred.",
                    type: "Error"
                });
            }
            return aMessages;
        },
        _showMessageDialog: function (aMessages) {
            var oMessageModel = new sap.ui.model.json.JSONModel(aMessages);

            var oMessageTemplate = new sap.m.MessageItem({
                type: "{type}",
                title: "{title}",
                description: "{description}"
            });

            var oMessageView = new sap.m.MessageView({
                items: {
                    path: "/",
                    template: oMessageTemplate
                }
            });

            oMessageView.setModel(oMessageModel);

            var oDialog = new sap.m.Dialog({
                title: "Test Run Results / Error Log",
                content: oMessageView,
                contentHeight: "50%",
                contentWidth: "50%",
                verticalScrolling: false,
                beginButton: new sap.m.Button({
                    text: "Close",
                    press: function () {
                        oDialog.close();
                    }
                })
            });

            this.getView().addDependent(oDialog);
            oDialog.open();
        },
        onRefreshRecentTable: function () {
            var oTable = this.byId("tblRecentMaterials");
            var oBinding = oTable.getBinding("items");
            if (oBinding) {
                oBinding.refresh();
            }
        },


        // Formatter to handle boolean visibility/editability from the fieldControl model
        formatFieldVisible: function (sProperty, sField) {
            var oFieldControl = this.getView().getModel("fieldControl");
            if (!oFieldControl) { return true; }

            // Path: fieldControl>/PlantDetails/Plant/visible
            var bVisible = oFieldControl.getProperty("/" + sProperty + "/" + sField + "/visible");
            return bVisible !== false; // Default to true if not explicitly false
        },

        formatFieldEditable: function (sProperty, sField, bIsCreateMode) {
            var oFieldControl = this.getView().getModel("fieldControl");
            if (!oFieldControl || !bIsCreateMode) { return false; }

            var bEditable = oFieldControl.getProperty("/" + sProperty + "/" + sField + "/editable");
            return bEditable !== false;
        },

        // Simple formatter for parts of the UI that only depend on Create Mode
        formatIsCreateMode: function (bIsCreateMode) {
            return bIsCreateMode === true;
        },

        // Flip the logic: Only return true if both are explicitly true
        formatCellEditable: function (bFieldEditable, bIsCreateMode) {
            // If config isn't loaded (undefined), this now returns false.
            return bFieldEditable === true && bIsCreateMode === true;
        },
        // Generic Formatter for Editability: 
        // Checks if field is editable in fieldControl AND if app is in Create Mode
        formatCellEditablebackup: function (bFieldEditable, bIsCreateMode) {
            // 1. If we aren't in Create Mode, definitely not editable
            if (!bIsCreateMode) {
                return false;
            }

            // 2. If bFieldEditable is undefined (meaning the field isn't in the 
            // fieldControl model yet), return false (Read Only)
            if (bFieldEditable === undefined || bFieldEditable === null) {
                return false;
            }

            // 3. Otherwise, return the actual boolean value from the config
            return bFieldEditable;
        },

        // Generic Formatter for Visibility:
        formatCellVisible: function (bFieldVisible) {
            return bFieldVisible !== false;
        },

        // Formatter for the PT Time string we fixed earlier
        formatTime: function (sTime) {
            if (!sTime) {
                return "";
            }

            // Handle SAP PT Format (e.g., PT20H18M38S)
            if (typeof sTime === "string" && sTime.indexOf("PT") !== -1) {
                var h = sTime.match(/(\d+)H/);
                var m = sTime.match(/(\d+)M/);
                var s = sTime.match(/(\d+)S/);

                // Extract values or default to "00" if the BAPI returns a flat hour (e.g., PT20H)
                var hh = (h && h[1]) ? h[1].padStart(2, '0') : "00";
                var mm = (m && m[1]) ? m[1].padStart(2, '0') : "00";
                var ss = (s && s[1]) ? s[1].padStart(2, '0') : "00";

                return hh + ":" + mm + ":" + ss;
            }

            // Fallback for standard Object format if needed
            if (typeof sTime === "object" && sTime.ms !== undefined) {
                var oDate = sap.ui.core.format.DateFormat.getTimeInstance({ pattern: "HH:mm:ss" });
                return oDate.format(new Date(sTime.ms), true);
            }

            return sTime;
        }
    });
});