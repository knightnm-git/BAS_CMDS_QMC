sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/comp/valuehelpdialog/ValueHelpDialog",
    "sap/ui/comp/filterbar/FilterBar",
    "sap/ui/comp/filterbar/FilterGroupItem",
    "sap/m/Input",
    "sap/m/MessageStrip"
], function (Controller, MessageToast, MessageBox, Filter, FilterOperator,
    ValueHelpDialog, FilterBar, FilterGroupItem, Input, MessageStrip) {
    "use strict";

    return Controller.extend("cos.cmds.qmc.cmdsqmc.controller.MainView", {
        onInit: function () {
            var oView = this.getView();
            var oTable = oView.byId("TblPlantDetails");

            // Register the table for message handling
            sap.ui.getCore().getMessageManager().registerObject(oTable, true);

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

        _loadTemplateData: function (sSelectedValue) {
            var oView = this.getView();
            var oModel = oView.getModel();
            var self = this;

            if (!sSelectedValue) {
                return;
            }

            oView.setBusy(true);

            // Clear existing messages before the new request
            sap.ui.getCore().getMessageManager().removeAllMessages();

            oModel.read("/MaterialHeaderSet('" + sSelectedValue + "')", {
                urlParameters: {
                    "$expand": "to_Plants,to_Valuations,to_LongTexts"
                },
                success: function (oData) {
                    if (oData && oData.MatlType) {
                        self._loadFieldControl(oData.MatlType, sSelectedValue);
                    } else {
                        oView.setBusy(false);
                        sap.m.MessageBox.error("Material Type not found.");
                    }
                },
                error: function (oError) {
                    oView.setBusy(false);

                    // get the specific backend message
                    var aMessages = self._parseODataError(oError);
                    var sMessage = (aMessages.length > 0) ? aMessages[0].message : "An unexpected error occurred.";

                    // Display the message. 
                    // The error is already in the MessageManager thanks to onInit registration.
                    // Just point the user to the popover.
                    var oBtn = self.byId("materialInput7"); // Anchor to the input field
                    self._getOutputMessagePopover().openBy(oBtn);
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
                                // I may need to add something here later
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
                        //Build some properties that will then be used as expression bindings on the view
                        oConfigMap[item.EntitySetName][item.FieldName] = {
                            editable: (item.FieldOption === "REQ" || item.FieldOption === "OPT"),
                            required: (item.FieldOption === "REQ"),
                            visible: (item.FieldOption !== "HID")
                        };
                    });

                    oFieldControlModel.setData(oConfigMap);
                    oFieldControlModel.updateBindings(true);

                    // Now that config is loaded, load the template data
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


        //******************************************************************//
        // Template Material Value Help Request - Client-side value request
        //******************************************************************//
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

        // Triggered when entering Template Material manually or pressing Enter
        // Handles manual typing and pressing Enter
        onTemplateSelect: function (oEvent) {
            var sSelectedValue = oEvent.getSource().getValue();

            if (sSelectedValue) {
                sSelectedValue = sSelectedValue.trim().toUpperCase();
                oEvent.getSource().setValue(sSelectedValue);

                // MANUALLY UPDATE THE MODEL
                var oModel = this.getView().getModel();
                oModel.setProperty("/TemplateMat", sSelectedValue);

                this._loadTemplateData(sSelectedValue);
            }
        },

        // Handles selection from the Value Help
        onMatValueConfirm: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            if (oSelectedItem) {
                var sMaterial = oSelectedItem.getBindingContext().getProperty("TemplateMat");
                var oInput = this.getView().byId("materialInput7");

                // Update the UI visually
                oInput.setValue(sMaterial);

                // MANUALLY UPDATE THE MODEL
                // Since we removed/changed the binding, we must push the value to the model
                var oModel = this.getView().getModel();
                oModel.setProperty("/TemplateMat", sMaterial);

                // Load the data as before
                this._loadTemplateData(sMaterial);
            }
        },

        //*******************************************************************//
        // Manufacturer Value Help Request - Server Side Value Help Request
        //*******************************************************************//
        onMfrValueHelpRequest: function (oEvent) {
            var oInput = oEvent.getSource();
            var oView = this.getView();
            var oModel = oView.getModel();

            if (!this._oMfrValueHelpDialog) {
                var oMfrVHModel = new sap.ui.model.json.JSONModel({
                    items: [],
                    showMaxWarning: false
                });
                oView.setModel(oMfrVHModel, "mfrVH");

                // Use the mapped variable 'ValueHelpDialog'
                this._oMfrValueHelpDialog = new ValueHelpDialog({
                    title: "Select Manufacturer",
                    supportMultiselect: false,
                    key: "Lifnr",
                    descriptionKey: "Mcod1",
                    basicSearchCallback: function () { return; },

                    ok: function (oControlEvent) {
                        var aTokens = oControlEvent.getParameter("tokens");
                        if (aTokens.length > 0) {
                            var sKey = aTokens[0].getKey();
                            oInput.setValue(sKey);
                            var oBinding = oInput.getBinding("value");
                            if (oBinding) {
                                oInput.getBindingContext().getModel().setProperty(oBinding.getPath(), sKey, oInput.getBindingContext());
                            }
                        }
                        this._oMfrValueHelpDialog.close();
                    }.bind(this),
                    cancel: function () {
                        this._oMfrValueHelpDialog.close();
                    }.bind(this)
                });

                // Use the mapped variable 'FilterBar'
                var oFilterBar = new FilterBar({
                    advancedMode: true,
                    useToolbar: true,
                    showGoOnFB: true, // This enables the 'Enter' key search
                    filterGroupItems: [
                        new FilterGroupItem({ groupName: "G1", name: "Lifnr", label: "Supplier", control: new Input({ name: "Lifnr" }) }),
                        new FilterGroupItem({ groupName: "G1", name: "Mcod1", label: "Name", control: new Input({ name: "Mcod1" }) }),
                        new FilterGroupItem({ groupName: "G1", name: "Mcod3", label: "Search Term", control: new Input({ name: "Mcod3" }) }),
                        new FilterGroupItem({ groupName: "G1", name: "Pstlz", label: "Post Code", control: new Input({ name: "Pstlz" }) })
                    ],
                    search: function (oEvt) {
                        var aSelectionSet = oEvt.getParameter("selectionSet");
                        var aFilters = aSelectionSet.reduce(function (aResult, oControl) {
                            if (oControl.getValue()) {
                                aResult.push(new Filter(oControl.getName(), "Contains", oControl.getValue()));
                            }
                            return aResult;
                        }, []);

                        var oTable = this._oMfrValueHelpDialog.getTable();
                        oTable.setBusy(true);

                        oModel.read("/MfrNoVHSet", {
                            filters: aFilters,
                            urlParameters: { "$top": 100 },
                            success: function (oData) {
                                var aResults = oData.results || [];

                                oView.getModel("mfrVH").setProperty("/items", aResults);
                                oView.getModel("mfrVH").setProperty("/showMaxWarning", aResults.length >= 100);

                                oTable.bindRows("mfrVH>/items");
                                oTable.setBusy(false);
                            }.bind(this),
                            error: function () { oTable.setBusy(false); }
                        });
                    }.bind(this)
                });

                // Use the mapped variable 'MessageStrip'
                oFilterBar.addContent(new MessageStrip({
                    text: "Only the first 100 results are shown. Refine filters if needed.",
                    type: "Information",
                    showIcon: true,
                    visible: "{mfrVH>/showMaxWarning}"
                }));

                this._oMfrValueHelpDialog.setFilterBar(oFilterBar);

                this._oMfrValueHelpDialog.getTableAsync().then(function (oTable) {
                    oTable.setModel(new sap.ui.model.json.JSONModel({
                        cols: [
                            { label: "Supplier", template: "mfrVH>Lifnr" },
                            { label: "Name", template: "mfrVH>Mcod1" },
                            { label: "Search Term", template: "mfrVH>Mcod3" },
                            { label: "Post Code", template: "mfrVH>Pstlz" }
                        ]
                    }), "columns");
                    oTable.setModel(oView.getModel("mfrVH"), "mfrVH");
                }.bind(this));

                oView.addDependent(this._oMfrValueHelpDialog);
            }
            this._oMfrValueHelpDialog.open();
        },

        //*******************************************************//
        // Generic Value Help Requests (for multiple fields)
        //    can be Client Side or Server side
        //    Can be configured simply by adding the below properties
        //       to the input field on the view
        // <m:Input 
        //      id="I4a_Grp" 
        //      value="{MatlGroup}" 
        //      showValueHelp="true" 
        //      valueHelpRequest="onValueHelpRequest"
        //      <m:customData>
        //          <core:CustomData key="entitySet" value="MatGrpVHSet" />
        //          <core:CustomData key="title" value="Select Material Group" />
        // **** Choose either client-side or server side filtering
        //          <core:CustomData key="useClientSide" value="true" />
        // **** Parameters to indicate which is the key field and description
        //          <core:CustomData key="keyField" value="Matkl" />
        //          <core:CustomData key="descField" value="Wgbez" />
        // **** If you want a description field also updated when a value is chosen
        //          <core:CustomData key="targetDescId" value="I4b_GrpD" />
        // **** Parameters for when the VH is dependent on other values in the entityset
        //          <core:CustomData key="parentField" value="Werks" />
        //          <core:CustomData key="parentValuePath" value="Plant" />
        //          <core:CustomData key="parentLabel" value="Plant" />
        // **** Parameters you can add if you want to filter by some other constant
        //          <core:CustomData key="fixedFilterField" value="Dimid" />
        //          <core:CustomData key="fixedFilterValue" value="MASS" />
        //      </m:customData>
        //  </m:Input>
        //******************************************************//
        onValueHelpRequest: function (oEvent) {
            var oInput = oEvent.getSource();
            this._oInputSource = oInput;
            var oView = this.getView();
            var oModel = oView.getModel();
            var that = this;

            var sEntitySet = oInput.data("entitySet");
            var sTitle = oInput.data("title");
            var sKeyField = oInput.data("keyField");
            var sDescField = oInput.data("descField");
            var sParentField = oInput.data("parentField");
            var sParentValuePath = oInput.data("parentValuePath");
            var sParentLabel = oInput.data("parentLabel");
            var sFixedField = oInput.data("fixedFilterField");
            var sFixedValue = oInput.data("fixedFilterValue");

            var oDialog = sap.ui.xmlfragment(oView.getId(), "cos.cmds.qmc.cmdsqmc.view.fragments.ValueHelpDialog", this);
            oView.addDependent(oDialog);
            oDialog.setTitle(sTitle);

            // --- STASH PARENT DATA FOR SEARCH ---
            // We only stash if they exist to prevent errors in onValueHelpSearch
            oDialog.data("parentField", sParentField || null);
            if (sParentValuePath && oInput.getBindingContext()) {
                oDialog.data("parentValue", oInput.getBindingContext().getProperty(sParentValuePath));
            } else {
                oDialog.data("parentValue", null);
            }

            var oLocalModel = oView.getModel("localVH") || new sap.ui.model.json.JSONModel();
            if (!oView.getModel("localVH")) { oView.setModel(oLocalModel, "localVH"); }

            var oCol2 = this.byId("Col2");
            // Only show a description column if one was requested
            var bHasDesc = !!sDescField; // true if sDescField is provided, false otherwise

            if (oCol2) {
                oCol2.setVisible(bHasDesc); // Hide the column if no description field
            }
            // The Key or ID column will always be shown
            var aCells = [
                new sap.m.Text({ text: "{localVH>" + sKeyField + "}" })
            ];

            // Only add the description cell if it exists
            if (bHasDesc) {
                aCells.push(new sap.m.Text({ text: "{localVH>" + sDescField + "}" }));
            }
            var aColumns = oDialog.getColumns();
            // Only show 3rd (parent Field) column if we have a label and a field defined
            if (sParentField && sParentLabel && aColumns.length > 2) {
                aColumns[2].setVisible(true);
                this.byId("VHTxt3").setText(sParentLabel);
                aCells.push(new sap.m.Text({ text: "{localVH>" + sParentField + "}" }));
            }

            var oItemTemplate = new sap.m.ColumnListItem({ cells: aCells });
            oDialog.bindAggregation("items", { path: "localVH>/" + sEntitySet, template: oItemTemplate });

            // --- INITIAL FILTERING ---
            var aFilters = [];
            var sStoredParentVal = oDialog.data("parentValue");
            if (sParentField && sStoredParentVal) {
                aFilters.push(new sap.ui.model.Filter(sParentField, sap.ui.model.FilterOperator.EQ, sStoredParentVal));
            }
            // Handle Hardcoded/Fixed Filters
            if (sFixedField && sFixedValue) {
                aFilters.push(new Filter(sFixedField, FilterOperator.EQ, sFixedValue));
            }
            oDialog.setBusy(true);
            oDialog.open();

            oModel.read("/" + sEntitySet, {
                filters: aFilters,
                success: function (oData) {
                    oLocalModel.setProperty("/" + sEntitySet, oData.results);
                    oDialog.setBusy(false);
                },
                error: function () { oDialog.setBusy(false); }
            });
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

            // Retrieve the stashed plant data
            var sParentField = oDialog.data("parentField");
            var sParentValue = oDialog.data("parentValue");

            var aFilters = [];

            // Setup the Filters (Standard UI5 Filter objects)
            // We need these for Client-Side filtering AND for the Server-Side Plant filter
            if (sValue && bClientSide) {
                aFilters.push(new sap.ui.model.Filter({
                    filters: [
                        new sap.ui.model.Filter(sKeyField, sap.ui.model.FilterOperator.Contains, sValue),
                        new sap.ui.model.Filter(sDescField, sap.ui.model.FilterOperator.Contains, sValue)
                    ],
                    and: false
                }));
            }

            if (sParentField && sParentValue) {
                aFilters.push(new sap.ui.model.Filter(sParentField, sap.ui.model.FilterOperator.EQ, sParentValue));
            }

            // 2. Execution Logic
            if (bClientSide) {
                // MRP Type Case: Filter the items already loaded in the dialog
                oDialog.getBinding("items").filter(aFilters);
            } else {
                // MRP Controller Case: Server-side request
                oDialog.setBusy(true);

                var mParameters = {};
                if (sValue) {
                    mParameters["search"] = sValue; // Pass to iv_search_string
                }

                oModel.read("/" + sEntitySet, {
                    filters: aFilters,      // Pass Parent (e.g. plant) to it_filter_select_options
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
                var oTextArea = oTab.getContent()[0];
                oTextObj.TextString = oTextArea.getValue();

                return oTextObj;
            }).filter(Boolean);

            // DEBUG: console.log("FINAL PAYLOAD", oPayload);

            // Create Call
            oModel.create("/MaterialHeaderSet", oPayload, {
                success: function (oData) {
                    oView.setBusy(false);

                    var sNewMaterial = oData.Material; // The generated number from SAP
                    // Flip the Master Switch to Lock the UI ---
                    this.getView().getModel("ui").setProperty("/isCreateMode", false);

                    MessageBox.success("Material " + sNewMaterial + " created successfully!", {
                        actions: [MessageBox.Action.OK],
                        onClose: function (sAction) {

                            // this.onReset(); // Clear the form for the next one

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
                            //        subtitle: "{message>additionalText}",
                            // This subtitle logic will dynamically find the label for ANY field
                            subtitle: {
                                path: "message>controlIds",
                                formatter: function (aControlIds) {
                                    if (aControlIds && aControlIds.length > 0) {
                                        // Get the first control associated with this error
                                        var oControl = sap.ui.getCore().byId(aControlIds[0]);
                                        if (oControl && oControl.getAriaLabelledBy) {
                                            var aLabels = oControl.getAriaLabelledBy();
                                            if (aLabels && aLabels.length > 0) {
                                                // Get the Text/Label control from the header and return its text
                                                var oLabel = sap.ui.getCore().byId(aLabels[0]);
                                                return oLabel ? oLabel.getText() : "";
                                            }
                                        }
                                    }
                                    return "";
                                }
                            },
                            description: "{message>description}",
                            //                         additionalText: "{message>additionalText}"
                        })
                    }
                });
                // set the message model to the popover 
                this._oMessagePopover.setModel(sap.ui.getCore().getMessageManager().getMessageModel(), "message");
                this.getView().addDependent(this._oMessagePopover);
            }
            return this._oMessagePopover;
        },

        onRefreshRecentTable: function () {
            var oTable = this.byId("TblRecentMaterials");
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
        },
        onPriceCtrlChange: function (oEvent) {
            var oInput = oEvent.getSource();
            var sNewValue = oEvent.getParameter("value").toUpperCase().trim(); // Ensure uppercase/no spaces
            var oContext = oInput.getBindingContext();

            if (!oContext) return;

            // 1. Validation Logic
            var bValid = (sNewValue === "S" || sNewValue === "V");

            if (!bValid && sNewValue !== "") {
                // Set Error State
                oInput.setValueState("Error");
                oInput.setValueStateText("Invalid Price Control. Please enter 'S' (Standard) or 'V' (Moving Average).");
            } else {
                // Clear Error State
                oInput.setValueState("None");
                oInput.setValueStateText("");

                // 2. Clear values of the "inactive" fields
                if (sNewValue === "S") {
                    oContext.setProperty("MovingPr", "0.00");
                } else if (sNewValue === "V") {
                    oContext.setProperty("StdPrice", "0.00");
                }
            }
        },

    });
});