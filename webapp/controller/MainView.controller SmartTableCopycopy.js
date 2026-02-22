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
            if (oModel) {
                oModel.setDefaultBindingMode(sap.ui.model.BindingMode.TwoWay);
            }

            // Initialize the UI state model
            var oViewModel = new sap.ui.model.json.JSONModel({
                isCreateMode: true, // The "Master Switch" for post-save locking
                hasData: false // Initially false because no template is loaded yet
            });
            this.getView().setModel(oViewModel, "ui");

            // Initialize an empty Field Control model to prevent binding errors
            this.getView().setModel(new sap.ui.model.json.JSONModel({}), "fieldControl");
        },

        onTemplateSelect: function (oEvent) {
            var sSelectedValue = oEvent.getParameter("value");
            this._loadTemplateData(sSelectedValue);

        },
        _loadTemplateData: function (sSelectedValue) {
            var oView = this.getView();
            var self = this; // Reference for inner functions
            if (!sSelectedValue) return;

            oView.setBusy(true);
            var sPath = "/MaterialHeaderSet('" + sSelectedValue + "')";

            oView.bindElement({
                path: sPath,
                parameters: { expand: "to_Plants,to_Valuations,to_LongTexts" },
                events: {
                    dataReceived: function (oData) {
                        oView.setBusy(false);
                        var oReceivedData = oData.getParameter("data");

                        if (!oReceivedData) {
                            // ... your existing error handling ...
                            return;
                        }
                        // Success! Lock the template field
                        oView.getModel("ui").setProperty("/hasData", true);

                        // Fetch Field Configuration ---

                        var sMatType = oReceivedData.MatlType;
                        if (sMatType) {
                            self._loadFieldControl(sMatType);
                        }

                        oView.getModel().updateBindings(true);
                    }.bind(this)
                }
            });
        },

        // Add this as a new method in your controller
        _loadFieldControl: function (sMatType) {
            var oModel = this.getView().getModel();
            var oView = this.getView();

            oModel.read("/FieldConfigSet", {
                urlParameters: {
                    "$filter": "MatType eq '" + sMatType + "'"
                },
                success: function (oData) {
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
                    oView.getModel("fieldControl").setData(oConfigMap);
                },
                error: function () {
                    console.error("Field configuration could not be loaded.");
                }
            });
        },

        onMaterialValueHelpRequest: function () {
            var oView = this.getView();
            if (!this._oSelectDialog) {
                this._oSelectDialog = sap.ui.xmlfragment(oView.getId(), "cos.cmds.qmc.cmdsqmc.view.fragments.MaterialValueHelp", this);
                oView.addDependent(this._oSelectDialog);
            }
            this._oSelectDialog.open();
        },
        onValueHelpRequest: function (oEvent) {
            var oInput = oEvent.getSource();
            this._oInputSource = oInput;

            var sEntitySet = oInput.data("entitySet");
            var sTitle = oInput.data("title");
            var sKeyField = oInput.data("keyField");
            var sDescField = oInput.data("descField");

            if (!this._pValueHelpDialog) {
                this._pValueHelpDialog = sap.ui.xmlfragment("cos.cmds.qmc.cmdsqmc.view.fragments.ValueHelpDialog", this);
                this.getView().addDependent(this._pValueHelpDialog);
            }

            this._pValueHelpDialog.setTitle(sTitle);

            // Create a local JSON model if it doesn't exist
            if (!this.getView().getModel("localVH")) {
                this.getView().setModel(new sap.ui.model.json.JSONModel(), "localVH");
            }

            var oLocalModel = this.getView().getModel("localVH");
            var oODataModel = this.getView().getModel();

            // Check if we already loaded this specific entity set to avoid ANY re-calls
            if (!oLocalModel.getProperty("/" + sEntitySet)) {
                this._pValueHelpDialog.setBusy(true);

                oODataModel.read("/" + sEntitySet, {
                    success: function (oData) {
                        // Store the results in the local JSON model
                        oLocalModel.setProperty("/" + sEntitySet, oData.results);

                        // Bind the Dialog to the LOCAL JSON model, NOT the OData model
                        this._bindDialogToLocal(sEntitySet, sKeyField, sDescField);
                        this._pValueHelpDialog.setBusy(false);
                    }.bind(this),
                    error: function () {
                        this._pValueHelpDialog.setBusy(false);
                    }.bind(this)
                });
            } else {
                // Data already exists locally, just ensure the binding is correct
                this._bindDialogToLocal(sEntitySet, sKeyField, sDescField);
            }

            this._pValueHelpDialog.open();
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
            if (oSelectedItem) {
                var aCells = oSelectedItem.getCells();
                var sKey = aCells[0].getText();
                var sDesc = aCells[1].getText();

                // Update the UI
                this._oInputSource.setValue(sKey);
                var sTargetId = this._oInputSource.data("targetDescId");
                if (sTargetId) {
                    var oDescInput = this.byId(sTargetId);
                    if (oDescInput) oDescInput.setValue(sDesc);
                }

                // Update the OData Model Property (for the deep create payload)
                var oBinding = this._oInputSource.getBinding("value");
                if (oBinding) {
                    oBinding.getModel().setProperty(oBinding.getPath(), sKey, this._oInputSource.getBindingContext());
                }
            }
        },
        onValueHelpSearch: function (oEvent) {
            var sValue = oEvent.getParameter("value");
            var sKeyField = this._oInputSource.data("keyField");

            // This filter now runs against the local JSON array in memory
            var oFilter = new sap.ui.model.Filter(sKeyField, sap.ui.model.FilterOperator.Contains, sValue);
            oEvent.getSource().getBinding("items").filter([oFilter]);
        },

        onValueHelpClose: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            var oInput = this._oInputSource;

            if (oSelectedItem) {
                var sKey = oSelectedItem.getTitle();
                var sDesc = oSelectedItem.getDescription();

                // 1. Update the Main Input (The technical key)
                oInput.setValue(sKey);

                // 2. Update the Description Field via ID (targetDescId from your XML)
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

        onValueConfirm: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            if (oSelectedItem) {
                var sMaterial = oSelectedItem.getBindingContext().getProperty("TemplateMat");
                this.getView().byId("materialInput7").setValue(sMaterial);
                this._loadTemplateData(sMaterial);
            }
        },

        onReset: function () {
            var oView = this.getView();
            var oInput = oView.byId("materialInput7");
            var self = this;

            MessageBox.confirm("This will clear all current data. Proceed?", {
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        // Reset the Master Switches
                        var oUiModel = oView.getModel("ui");
                        oUiModel.setProperty("/isCreateMode", true);
                        oUiModel.setProperty("/hasData", false);

                        // Clear the Input and Field Config
                        oInput.setValue("");
                        if (oView.getModel("fieldControl")) {
                            oView.getModel("fieldControl").setData({});
                        }

                        // Unbind the element to stop the 'hanging' expansion
                        oView.unbindElement();

                        // Force a refresh of the binding to ensure tables (SmartTables) clear
                        oView.getModel().updateBindings(true);

                        MessageToast.show("Form reset and ready for new template.");
                    }
                }
            });
        },

        onCreateMaterial: function () {
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

            // Get the Plants Data (STble2) - Using path-based property access for current values
            var oPlantsTable = oView.byId("STble2").getTable();
            oPayload.to_Plants = oPlantsTable.getItems().map(function (oItem) {
                var oCtx = oItem.getBindingContext();
                return oCtx ? fnSanitize(oModel.getProperty(oCtx.getPath())) : null;
            }).filter(Boolean);

            // Get the Valuation Data (STble3)
            var oValTable = oView.byId("STble3").getTable();
            oPayload.to_Valuations = oValTable.getItems().map(function (oItem) {
                var oCtx = oItem.getBindingContext();
                return oCtx ? fnSanitize(oModel.getProperty(oCtx.getPath())) : null;
            }).filter(Boolean);

            // Structural Integrity
            oPayload.to_Plants = oPayload.to_Plants || [];
            oPayload.to_Valuations = oPayload.to_Valuations || [];
            oPayload.to_LongTexts = [];

            // Backend naming alignment
            oPayload.Matnr = "";
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
            console.log("FINAL PAYLOAD", oPayload);

            // Create Call
            oModel.create("/MaterialHeaderSet", oPayload, {
                success: function (oData) {
                    oView.setBusy(false);

                    var sNewMatnr = oData.Matnr; // The generated number from SAP
                    // -- NEW: Flip the Master Switch to Lock the UI ---
                    this.getView().getModel("ui").setProperty("/isCreateMode", false);

                    MessageBox.success("Material " + sNewMatnr + " created successfully!", {
                        actions: ["Display Material", MessageBox.Action.OK],
                        emphasizedAction: "Display Material",
                        onClose: function (sAction) {
                            if (sAction === "Display Material") {
                                // Navigate to the display route (adjust 'display' to your route name)
                                this.getOwnerComponent().getRouter().navTo("display", {
                                    Matnr: sNewMatnr
                                });
                                //   } else {
                                // this.onReset(); // Clear the form for the next one
                            }
                        }.bind(this)
                    });
                }.bind(this),
                error: function (oError) {
                    oView.setBusy(false);

                    var aMessages = [];
                    try {
                        var oResponse = JSON.parse(oError.responseText);
                        var aDetails = oResponse.error.innererror.errordetails;

                        // Filter out the "noise" from the Gateway Framework
                        aMessages = aDetails.filter(function (msg) {
                            var bIsFrameworkError = msg.code === "/IWBEP/CM_MGW_RT/022" ||
                                msg.code === "/IWBEP/CX_MGW_BUSI_EXCEPTION" ||
                                msg.message === "Exception raised without specific error";
                            return !bIsFrameworkError;
                        }).map(function (msg) {
                            return {
                                type: msg.severity === "error" ? "Error" :
                                    msg.severity === "warning" ? "Warning" :
                                        msg.severity === "info" ? "Information" : "Success",
                                title: msg.message,
                                description: msg.code
                            };
                        });
                    } catch (e) {
                        aMessages.push({ type: "Error", title: "An unexpected error occurred." });
                    }

                    this._showMessageDialog(aMessages);
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
        onRefreshRecentTable: function () {
            var oTable = this.byId("tblRecentMaterials");
            var oBinding = oTable.getBinding("items");
            if (oBinding) {
                oBinding.refresh();
            }
        },
formatTime: function(sTime) {
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
        var oDate = sap.ui.core.format.DateFormat.getTimeInstance({pattern: "HH:mm:ss"});
        return oDate.format(new Date(sTime.ms), true);
    }

    return sTime;
}
    });
});