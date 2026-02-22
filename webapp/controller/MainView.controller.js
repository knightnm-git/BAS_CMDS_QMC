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
            // Ensure the model allows data to flow from View back to Model
            var oModel = this.getOwnerComponent().getModel();
            if (oModel) {
                oModel.setDefaultBindingMode(sap.ui.model.BindingMode.TwoWay);
            }

            var oViewModel = new sap.ui.model.json.JSONModel({
                isEditable: true
            });
            
            this.getView().setModel(oViewModel, "ui");
        },

        onTemplateSelect: function (oEvent) {
            var sSelectedValue = oEvent.getParameter("value");
            this._loadTemplateData(sSelectedValue);
        },

        _loadTemplateData: function (sSelectedValue) {
            var oView = this.getView();
            if (!sSelectedValue) return;

            oView.setBusy(true);
            var sPath = "/MaterialHeaderSet('" + sSelectedValue + "')";

            oView.bindElement({
                path: sPath,
                parameters: {
                    expand: "to_Plants,to_Valuations,to_LongTexts"
                },
                events: {
                    dataRequested: function () {
                        oView.setBusy(true);
                    },
                    dataReceived: function (oData) {
                        oView.setBusy(false);
                        if (!oData.getParameter("data")) {
                            MessageBox.error("Material '" + sSelectedValue + "' not found.", {
                                title: "Error",
                                onClose: function () {
                                    oView.byId("materialInput7").setValue("");
                                    oView.byId("materialInput7").focus();
                                }
                            });
                            return;
                        }
                        oView.getModel().updateBindings(true);
                    },
                    change: function () {
                        oView.setBusy(false);
                    }
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

        onValueHelpSearch1: function (oEvent) {
            var sValue = oEvent.getParameter("value");
            var sKeyField = this._oInputSource.data("keyField");
            var oFilter = new sap.ui.model.Filter(sKeyField, sap.ui.model.FilterOperator.Contains, sValue);

            // Explicitly filter the existing binding
            oEvent.getSource().getBinding("items").filter([oFilter]);
        },
        onValueHelpRequest1: function (oEvent) {
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

            // --- STOP DOUBLE CALLS ---
            // Get the current binding of the dialog
            var oBinding = this._pValueHelpDialog.getBinding("items");

            // Only bind if the path has changed or if it's never been bound
            // This prevents the "Call Twice" issue when reopening the same F4
            if (!oBinding || (oBinding && oBinding.getPath() !== "/" + sEntitySet)) {

                var oItemTemplate = new sap.m.ColumnListItem({
                    cells: [
                        new sap.m.Text({ text: "{" + sKeyField + "}" }),
                        new sap.m.Text({ text: "{" + sDescField + "}" })
                    ]
                });

                this._pValueHelpDialog.bindAggregation("items", {
                    path: "/" + sEntitySet,
                    template: oItemTemplate,
                    parameters: {
                        // Optional: Reduce payload size to only the fields you need
                        select: sKeyField + "," + sDescField
                    }
                });
            }

            this._pValueHelpDialog.open();
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
        onValueHelpConfirm1: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            var oInput = this._oInputSource; // Saved during onValueHelpRequest

            if (!oSelectedItem) {
                return;
            }

            // 1. Get values from the Table Cells
            // Cell 0 is the Key (e.g. Matkl), Cell 1 is the Description (e.g. Wgbez)
            var aCells = oSelectedItem.getCells();
            var sKey = aCells[0].getText();
            var sDesc = aCells[1].getText();

            // 2. Update the Source Input (The technical key)
            oInput.setValue(sKey);

            // 3. Update the Description Field (The non-editable field next to it)
            var sTargetDescId = oInput.data("targetDescId");
            if (sTargetDescId) {
                var oDescField = this.byId(sTargetDescId);
                if (oDescField) {
                    oDescField.setValue(sDesc);
                }
            }

            // 4. Critical: Update the OData Model
            // Without this, the 'Create' payload will still have the old/blank value
            var oBinding = oInput.getBinding("value");
            if (oBinding) {
                var sPath = oBinding.getPath();
                var oContext = oInput.getBindingContext();
                oContext.getModel().setProperty(sPath, sKey, oContext);
            }

            // Clear search filter for next time
            oEvent.getSource().getBinding("items").filter([]);
        },
        onValueHelpSearch1: function (oEvent) {
            var sValue = oEvent.getParameter("value");
            var sKeyField = this._oInputSource.data("keyField");
            var oFilter = new sap.ui.model.Filter(sKeyField, sap.ui.model.FilterOperator.Contains, sValue);

            // This filters the data already in the client/buffer
            oEvent.getSource().getBinding("items").filter([oFilter]);
        },

        onValueHelpSearch1: function (oEvent) {
            var sValue = oEvent.getParameter("value");
            var oInput = this._oInputSource;
            var sKeyField = oInput.data("keyField");

            var oBinding = oEvent.getSource().getBinding("items");
            if (oBinding && sValue) {
                var aFilters = [new Filter(sKeyField, FilterOperator.Contains, sValue)];
                oBinding.filter(aFilters);
            }
        },

        onReset: function () {
            var oView = this.getView();
            var oInput = oView.byId("materialInput7");

            MessageBox.confirm("This will clear all current data. Proceed?", {
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        oInput.setValue("");
                        oView.unbindElement();
                        oView.getModel().updateBindings(true);
                        MessageToast.show("Form reset.");
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
                    MessageBox.error("Creation failed. Please check the SAP Error Log.");
                }.bind(this)
            });
        }
    });
});