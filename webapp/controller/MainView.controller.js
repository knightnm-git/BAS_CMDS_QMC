sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend("cos.cmds.qmc.cmdsqmc.controller.MainView", {

        onInit: function () {
            // Ensure the model allows data to flow from View back to Model
            var oModel = this.getOwnerComponent().getModel();
            if (oModel) {
                oModel.setDefaultBindingMode(sap.ui.model.BindingMode.TwoWay);
            }
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
                          /*  MessageBox.error("Material '" + sSelectedValue + "' not found.", {
                                title: "Error",
                                onClose: function () {
                                    oView.byId("materialInput7").setValue("");
                                    oView.byId("materialInput7").focus();
                                } 
                            });*/
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

        onValueConfirm: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            if (oSelectedItem) {
                var sMaterial = oSelectedItem.getBindingContext().getProperty("TemplateMat");
                this.getView().byId("materialInput7").setValue(sMaterial);
                this._loadTemplateData(sMaterial);
            }
        },

        onValueHelpSearch: function (oEvent) {
            var sValue = oEvent.getParameter("value");
            var oBinding = oEvent.getSource().getBinding("items");
            if (oBinding && sValue) {
                var aFilters = [new sap.ui.model.Filter("TemplateMat", sap.ui.model.FilterOperator.Contains, sValue)];
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

          //  console.log("FINAL PAYLOAD", oPayload);

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