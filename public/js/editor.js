// Copyright (c) 2018 Chandan B N. All rights reserved.

var output = document.getElementById('output');
var starting_value = {};

var sourceEditor = ace.edit("output");
sourceEditor.getSession().setMode("ace/mode/json");
sourceEditor.getSession().on('change', incSourceChanges);
sourceEditor.setOptions({
    maxLines: 480,
    wrap: true
});
sourceEditor.$blockScrolling = Infinity;

async function syncContents(tab) {
    var j = docEditor.getValue();
    insync = true;
    sourceEditor.getSession().setValue(JSON.stringify(j, null, 2));
    sourceEditor.clearSelection();
    insync = false;
    if (document.getElementById("yaml")) {
        document.getElementById("yaml").textContent = YAML.stringify(j, 20, 2);
    }
    if (tab == "advisoryTab" && pugRender && document.getElementById("render")) {
        if (schemaName == "sa") {
            var cSet = new Set();
            var clist = [];
            for (var d of j.CVE_list) {
                if (d.CVE) {
                    for (var x of d.CVE.match(/CVE-\d{4}-[a-zA-Z\d\._-]{4,}/igm)) {
                        cSet.add(x);
                    }
                }
            };
            if (cSet.size > 0) {
                var r = await textUtil.getDocuments('cve', Array.from(cSet));
                var CVE_map = {};
                for (c of r) {
                    CVE_map[c.body.CVE_data_meta.ID] = c.body;
                    cSet.delete(c.body.CVE_data_meta.ID);
                }
                if (cSet.size > 0) {
                    var r = await textUtil.getDocuments('nvd', Array.from(cSet));
                    for (c of r) {
                        CVE_map[c.body.CVE_data_meta.ID] = c.body;
                    }
                }
                var cSum = textUtil.sumCVE(j.CVE_list, CVE_map);
                document.getElementById("render").innerHTML = pugRender({
                    renderTemplate: 'advisory',
                    doc: j,
                    cmap: CVE_map,
                    cSum: cSum
                });

            } else {
                document.getElementById("render").innerHTML = pugRender({
                    renderTemplate: 'advisory',
                    doc: j,
                    cmap: {},
                    cSum: {}
                });
            }
        } else {
            document.getElementById("render").innerHTML = pugRender({
                renderTemplate: 'advisory',
                doc: j
            });
        }
    }
    if (tab == "mitreTab" && document.getElementById("mitreweb")) {
        document.getElementById("mitreweb").innerHTML = pugRender({
            renderTemplate: 'mitre',
            doc: j
        });
    }
    if (tab == "jsonTab" && document.getElementById("outjson")) {
        document.getElementById("outjson").textContent = textUtil.getMITREJSON(textUtil.reduceJSON(j));
    }
}

JSONEditor.defaults.resolvers.unshift(function (schema) {
    if (schema.type === "string" && schema.format === "radio") {
        return "radio";
    }
});

JSONEditor.defaults.templates.custom = function () {
    return {
        compile: function (template) {
            return function (context) {
                return eval(template);
            }
        }
    }
}

// allow file uploads
JSONEditor.defaults.options.upload = function (type, file, cbs) {

    var reader = new FileReader();
    var xhr = new XMLHttpRequest();
    var fd = new FormData();
    fd.append('file1', file);
    this.xhr = xhr;
    var self = this;
    this.xhr.upload.addEventListener("loadstart", function (e) {
        cbs.updateProgress(0); //
    }, false);

    this.xhr.upload.addEventListener("progress", function (e) {
        if (e.lengthComputable) {
            var percentage = Math.round((e.loaded * 100) / e.total);
            cbs.updateProgress(percentage)
            //self.ctrl.update(percentage);
        }
    }, false);

    xhr.upload.addEventListener("load", function (e) {
        //self.ctrl.update(100);
        cbs.updateProgress(100);
        //var canvas = self.ctrl.ctx.canvas;
        //canvas.parentNode.removeChild(canvas);
    }, false);
    var uf = function (e) {
        cbs.failure('Upload failed:');
    };
    xhr.addEventListener("error", uf, false);
    xhr.addEventListener("abort", uf, false);

    xhr.upload.addEventListener("error", uf, false);
    xhr.upload.addEventListener("abort", uf, false);

    xhr.onreadystatechange = function (oEvent) {
        if (xhr.readyState === 4) {
            if (xhr.status === 200) {
                if (xhr.response == '{"ok":"1"}') {
                    //console.log(xhr.responseText);
                    cbs.success(file.name);
                } else {
                    cbs.failure('Upload failed: ' + xhr.statusText);
                }
            } else if (xhr.status === 404) {
                cbs.failure('Upload failed: ID Not found. Try saving document first!');
            }
        }
    };

    xhr.open("POST", window.location + '/file');
    xhr.setRequestHeader('X-CSRF-Token', csrfToken)
    xhr.overrideMimeType('text/plain; charset=x-user-defined-binary');
    xhr.send(fd);
};

JSONEditor.defaults.editors.radio = JSONEditor.AbstractEditor.extend({
    setValue: function (value, initial) {
        value = this.typecast(value || '');

        // Sanitize value before setting it
        var sanitized = value;
        if (this.schema.enum.indexOf(sanitized) < 0) {
            sanitized = this.schema.enum[0];
        }

        if (this.value === sanitized) {
            return;
        }

        var self = this;
        for (var input in this.inputs) {
            if (input === sanitized) {

                this.inputs[input].checked = true;
                self.value = sanitized;
                self.jsoneditor.notifyWatchers(self.path);
                return false;
            }
        }
    },
    register: function () {
        this._super();
        if (!this.inputs) return;
        for (var i = 0; i < this.inputs.length; i++) {
            this.inputs[i].setAttribute('name', this.formname);
        }
    },
    unregister: function () {
        this._super();
        if (!this.inputs) return;
        for (var i = 0; i < this.inputs.length; i++) {
            this.inputs[i].removeAttribute('name');
        }
    },
    getNumColumns: function () {
        var longest_text = this.getTitle().length;
        for (var i = 0; i < this.schema.enum.length; i++) {
            longest_text = Math.max(longest_text, this.schema.enum[i].length + 4);
        }
        return Math.min(12, Math.max(longest_text / 7, 2));
    },
    typecast: function (value) {
        if (this.schema.type === "boolean") {
            return !!value;
        } else if (this.schema.type === "number") {
            return 1 * value;
        } else if (this.schema.type === "integer") {
            return Math.floor(value * 1);
        } else {
            return "" + value;
        }
    },
    getValue: function () {
        return this.value;
    },
    removeProperty: function () {
        this._super();
        for (var i = 0; i < this.inputs.length; i++) {
            this.inputs[i].style.display = 'none';
        }
        if (this.description) this.description.style.display = 'none';
        this.theme.disableLabel(this.label);
    },
    addProperty: function () {
        this._super();
        for (var i = 0; i < this.inputs.length; i++) {
            this.inputs[i].style.display = '';
        }
        if (this.description) this.description.style.display = '';
        this.theme.enableLabel(this.label);
    },
    sanitize: function (value) {
        if (this.schema.type === "number") {
            return 1 * value;
        } else if (this.schema.type === "integer") {
            return Math.floor(value * 1);
        } else {
            return "" + value;
        }
    },
    build: function () {
        var self = this,
            i;
        if (!this.options.compact) this.header = this.label = this.theme.getFormInputLabel(this.getTitle());
        if (this.schema.description) this.description = this.theme.getFormInputDescription(this.schema.description);

        this.select_options = {};
        this.select_values = {};

        var e = this.schema.enum || [];
        var options = [];
        for (i = 0; i < e.length; i++) {
            // If the sanitized value is different from the enum value, don't include it
            if (this.sanitize(e[i]) !== e[i]) continue;

            options.push(e[i] + "");
            this.select_values[e[i] + ""] = e[i];
        }

        this.input_type = 'radiogroup';
        this.inputs = {};
        this.controls = {};
        for (i = 0; i < options.length; i++) {
            this.inputs[options[i]] = this.theme.getRadio();
            this.inputs[options[i]].setAttribute('value', options[i]);
            this.inputs[options[i]].setAttribute('name', this.formname);
            this.inputs[options[i]].setAttribute('id', this.formname + options[i]);
            var label = this.theme.getRadioLabel((this.schema.options && this.schema.options.enum_titles && this.schema.options.enum_titles[i]) ?
                this.schema.options.enum_titles[i] :
                options[i]);
            label.setAttribute('for', this.formname + options[i]);
            label.setAttribute('class', options[i]);
            this.controls[options[i]] = this.theme.getFormControl(this.inputs[options[i]], label);
        }

        this.control = this.theme.getRadioGroupHolder(this.controls, this.label, this.description);
        this.container.appendChild(this.control);
        this.control.addEventListener('change', function (e) {
            e.preventDefault();
            e.stopPropagation();

            var val = e.target.value;

            var sanitized = val;
            if (self.schema.enum.indexOf(val) === -1) {
                sanitized = self.schema.enum[0];
            }

            self.value = sanitized;

            if (self.parent) self.parent.onChildEditorChange(self);
            else self.jsoneditor.onChange();
            self.jsoneditor.notifyWatchers(self.path);
        });
    },
    enable: function () {
        if (!this.always_disabled) {
            var opts = Object.keys(this.inputs);
            for (var i = 0; i < opts.length; i++) {
                this.inputs[opts[i]].disabled = false;
            }
        }
        this._super();
    },
    disable: function () {
        //console.log(this.inputs);
        var opts = Object.keys(this.inputs);
        for (var i = 0; i < opts.length; i++) {
            this.inputs[opts[i]].disabled = true;
        }
        this._super();
    },
    destroy: function () {
        if (this.label) this.label.parentNode.removeChild(this.label);
        if (this.description) this.description.parentNode.removeChild(this.description);
        for (var i = 0; i < this.inputs.length; i++) {
            this.inputs[i].parentNode.removeChild(this.inputs[i]);
        }
        this._super();
    }
});

function tzOffset(x) {
    var offset = new Date(x).getTimezoneOffset(),
        o = Math.abs(offset);
    return (offset < 0 ? "+" : "-") + ("00" + Math.floor(o / 60)).slice(-2) + ":" + ("00" + (o % 60)).slice(-2);
}

// The time is displayed/set in local times in the input,
//  but setValue, getValue use UTC. JSON output will be in UTC.
JSONEditor.defaults.editors.dateTime = JSONEditor.defaults.editors.string.extend({
    getValue: function () {
        if (this.value && this.value.length > 0) {
            if (this.value.match(/^\d{4}-\d{2}-\d{2}T[\d\:\.]+$/)) {
                this.value = this.value + tzOffset(this.value);
            }
            var d = new Date(this.value);
            if (d instanceof Date && !isNaN(d.getTime())) {
                return d.toISOString();
            } else {
                return this.value;
            }
        } else {
            return "";
        }
    },

    setValue: function (val) {
        if (val && this.value.match(/^\d{4}-\d{2}-\d{2}T[\d\:\.]+$/)) {
            val = val + tzOffset();
        }
        var d = new Date(val);
        if (d instanceof Date && !isNaN(d.getTime()) && d.getTime() > 0) {
            var x = new Date((d.getTime() - (d.getTimezoneOffset() * 60000)));
            this.value =
                this.input.value = x.toJSON().slice(0, 16);
        } else {
            this.value = this.input.value = "";
        }
        this.jsoneditor.notifyWatchers(this.path);
    },

    build: function () {
        this.schema.format = "datetime-local";
        this._super();
        var tzInfo = document.createElement('small');
        tzInfo.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone;
        this.input.parentNode.appendChild(tzInfo);
    }
});


JSONEditor.defaults.editors.taglist = JSONEditor.defaults.editors.string.extend({
    getValue: function () {
        if (this.input && this.input.value) {
            return this.input.value.split(/[\s,]+/);
        } else {
            return [];
        }
    },

    setValue: function (val) {
        if (val instanceof Array) {
            //this.value = val.split();
            this.input.value = val.join(' ');
        } else {
            this.input.value = val;
        }
    },

    build: function () {
        this.schema.format = "taglist";
        this._super();
    }
});

// Instruct the json-editor to use the custom datetime-editor.
JSONEditor.defaults.resolvers.unshift(function (schema) {
    if (schema.type === "string" && schema.format === "datetime") {
        return "dateTime";
    }

});

JSONEditor.defaults.resolvers.unshift(function (schema) {
    if (schema.type === "array" && schema.format === "taglist") {
        return "taglist";
    }

});

JSONEditor.defaults.editors.object = JSONEditor.defaults.editors.object.extend({
    layoutEditors: function () {
        var propertyNumber = 1;
        for (let key of Object.keys(this.editors)) {
            let schema = this.editors[key].schema;
            if (!schema.propertyOrder) {
                schema.propertyOrder = propertyNumber;
            }
            ++propertyNumber;
        }
        this._super();
    }
});

JSONEditor.defaults.editors.upload =
    JSONEditor.defaults.editors.upload.extend({
        build: function () {
            this._super();
            var a = document.createElement('a');
            a.target = "_blank";
            this.control.replaceChild(a, this.label);
            this.label = this.title = a;
        },
        setValue: function (val) {
            if (this.value !== val) {
                this.title.href = window.location + '/file/' + encodeURIComponent(val);
                this.title.textContent = val;
                this._super(val);
            }
        },
        refreshPreview: function () {
            if (this.last_preview === this.preview_value) return;
            this.last_preview = this.preview_value;

            this.preview.innerHTML = '';

            if (!this.preview_value) return;

            var self = this;

            var mime = this.preview_value.match(/^data:([^;,]+)[;,]/);
            if (mime) mime = mime[1];
            if (!mime) mime = 'unknown';

            var file = this.uploader.files[0];

            this.preview.textContent = fileSize(file.size);
            var uploadButton = this.getButton('Upload', 'upload', 'Upload');
            this.preview.appendChild(uploadButton);
            uploadButton.addEventListener('click', function (event) {
                event.preventDefault();

                uploadButton.setAttribute("disabled", "disabled");
                self.theme.removeInputError(self.uploader);

                if (self.theme.getProgressBar) {
                    self.progressBar = self.theme.getProgressBar();
                    self.preview.appendChild(self.progressBar);
                }

                self.jsoneditor.options.upload(self.path, file, {
                    success: function (url) {
                        self.setValue(url);

                        if (self.parent) self.parent.onChildEditorChange(self);
                        else self.jsoneditor.onChange();

                        if (self.progressBar) self.preview.removeChild(self.progressBar);
                        uploadButton.textContent = 'Done';
                        uploadButton.setAttribute('value', 'Done');
                        uploadButton.setAttribute('disabled', true);
                    },
                    failure: function (error) {
                        self.theme.addInputError(self.uploader, error);
                        if (self.progressBar) self.preview.removeChild(self.progressBar);
                        uploadButton.removeAttribute("disabled");
                        uploadButton.textContent = "Upload";

                    },
                    updateProgress: function (progress) {
                        if (self.progressBar) {
                            if (progress) self.theme.updateProgressBar(self.progressBar, progress);
                            else self.theme.updateProgressBarUnknown(self.progressBar);
                        }
                    }
                });
            });
        }
    });

JSONEditor.defaults.themes.custom = JSONEditor.AbstractTheme.extend({
    /*    getBlockLinkHolder: function() {
            var el = this._super();
            el.className = 'rightFloat';
            return el;
      },
      getLinksHolder: function() {
            var el = this._super();
            el.className = 'rightFloat';
            return el;
      },*/

    getDescription: function (text) {
        var el = document.createElement('summary');
        el.innerHTML = text;
        return el;
    },
    getFormControl: function(label, input, description) {
    var el = document.createElement('div');
    el.className = 'form-control';
    if(label) el.appendChild(label);
    if(input.type === 'checkbox') {
      label.insertBefore(input,label.firstChild);
      if(description) el.appendChild(description);
    }
    else {
      input.setAttribute('placeholder', description ? description.textContent : '');
      el.appendChild(input);
    }
    return el;
  },
  
    getFormInputLabel: function (text) {
        var el = this._super(text);
        el.className = text;
        return el;
    },
    getFormInputDescription: function (text) {
        var el = this._super(text);
        return el;
    },
    getIndentedPanel: function () {
        var el = this._super();
        el.style = "";
        return el;
    },
    getChildEditorHolder: function () {
        var el = this._super();
        return el;
    },
    getHeaderButtonHolder: function () {
        var el = this.getButtonHolder();
        return el;
    },
    getHeader: function (text) {
        var el = document.createElement('h3');
        if (typeof text === "string") {
            el.textContent = text;
            el.className = text;
        } else {
            text.className = text.textContent;
            el.appendChild(text);
        }
        return el;
    },
    getTable: function () {
        var el = this._super();
        return el;
    },
    addInputError: function (input, text) {
        input.style.borderColor = 'coral';

        if (!input.errmsg) {
            var group = this.closest(input, '.form-control');
            input.errmsg = document.createElement('div');
            input.errmsg.setAttribute('class', 'errmsg');
            input.errmsg.style = input.errmsg.style || {};
            group.appendChild(input.errmsg);
        } else {
            input.errmsg.style.display = 'block';
        }

        input.errmsg.textContent = '';
        input.errmsg.appendChild(document.createTextNode(text));
    },
    removeInputError: function (input) {
        input.style.borderColor = '';
        if (input.errmsg) input.errmsg.style.display = 'none';
    },
    getRadio: function () {
        var el = this.getFormInputField('radio');
        return el;
    },
    getRadioGroupHolder: function (controls, label, description) {
        var el = document.createElement('div');
        var radioGroup = document.createElement('div');
        radioGroup.className = 'radiogroup';

        if (label) {
            label.style.display = 'inline-block';
            el.appendChild(label);
        }
        el.appendChild(radioGroup);
        for (var i in controls) {
            if (!controls.hasOwnProperty(i)) continue;
            radioGroup.appendChild(controls[i]);
        }

        if (description) el.appendChild(description);
        return el;
    },
    getRadioLabel: function (text) {
        var el = this.getFormInputLabel(text);
        return el;
    },
    getProgressBar: function () {
        var max = 100,
            start = 0;

        var progressBar = document.createElement('progress');
        progressBar.setAttribute('max', max);
        progressBar.setAttribute('value', start);
        return progressBar;
    },
    updateProgressBar: function (progressBar, progress) {
        if (!progressBar) return;
        progressBar.setAttribute('value', progress);
    },
    updateProgressBarUnknown: function (progressBar) {
        if (!progressBar) return;
        progressBar.removeAttribute('value');
    }
});


var docEditorOptions = {
    // Enable fetching schemas via ajax
    ajax: true,
    theme: 'custom',
    disable_collapse: true,
    disable_array_reorder: true,
    disable_properties: true,
    disable_edit_json: true,
    disable_array_delete_last_row: true,
    disable_array_delete_all_rows: true,
    expand_height: true,
    input_width: '3em',
    input_height: '4em',
    template: 'custom',
    // The schema for the editor
    schema: docSchema,
    // Seed the form with a starting value
    //starting_value: {},

    // Disable additional properties
    //no_additional_properties: false,

    // Require all properties by default
    //required_by_default: false,
    //display_required_only: false
};
var docEditor = new JSONEditor(document.getElementById('editor'), docEditorOptions);

if (initJSON) {
    docEditor.root.setValue(initJSON, true);
}

var selected = "editorTab";
var tabs = document.getElementsByName("tabs");
for (var i = 0; i < tabs.length; i++) {
    if (tabs[i].checked === true) {
        selected = tabs[i].id;
        break;
    }
}
syncContents(selected);

function docEditorValid(j) {
    var errors = [];
    if (j) {
        errors = docEditor.validate(j);
    } else {
        errors = docEditor.validate();
    }
    if (errors.length) {
        docEditor.setOption('show_errors', 'always');
        errMsg.textContent = (errors.length > 1 ? errors.length + " errors" : "Error") + " found";
        editorLabel.className = "tablabel errtab";
        return false;
    } else {
        errMsg.textContent = "";
        editorLabel.className = "tablabel";
        return true;
    }
}

function source2editor() {
    insync = true;
    var result = JSON.parse(sourceEditor.getSession().getValue());
    docEditor.root.setValue(result, true);
    insync = false;
    return result;
}

function sourceEditorValid() {
    try {
        var hasError = false;
        var firsterror = null;
        var annotations = sourceEditor.getSession().getAnnotations();
        for (var l in annotations) {
            var annotation = annotations[l];
            if (annotation.type === "error") {
                hasError = true;
                firsterror = annotation;
                break;
            }
        }
        if (!hasError) {
            return true;
        } else {
            sourceEditor.moveCursorTo(firsterror.row, firsterror.column, false);
            sourceEditor.clearSelection();
            errMsg.textContent = 'Please fix error: ' + firsterror.text;
            document.getElementById("sourceTab").checked = true;
            return false;
        }
    } catch (err) {
        errMsg.textContent = err.message;
        document.getElementById("sourceTab").checked = true;
        return false;
    } finally {}
}

function save() {
    if (document.getElementById("sourceTab").checked === true) {
        if (!sourceEditorValid()) {
            return;
        } else {
            var j = source2editor();
            if (!docEditorValid(j)) {
                document.getElementById("editorTab").checked = true;
                return;
            }
        }
    }
    if (!docEditorValid()) {
        document.getElementById("editorTab").checked = true;
        return;
    }

    infoMsg.textContent = "Saving...";
    var e = docEditor.getValue();
    fetch(postUrl ? postUrl : '', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json',
                'CSRF-Token': csrfToken
            },
            redirect: 'error',
            body: JSON.stringify(e),
        })
        .then(function (response) {
            if (!response.ok) {
                throw Error(response.statusText);
            }
            return response.json();
        })
        .then(function (res) {
            if (res.type == "go") {
                window.location.href = res.to;
            } else if (res.type == "err") {
                errMsg.textContent = res.msg;
                infoMsg.textContent = "";
            } else if (res.type == "saved") {
                infoMsg.textContent = "Saved";
                errMsg.textContent = "";
                document.title = originalTitle;
                // turn button to normal, indicate nothing to save,
                // but do not disable it.
                if (document.getElementById("save1")) {
                    save2.className = "button save"
                    save1.className = "button tabbutton save";
                }
                getChanges(getDocID());
            }
            changes = 0;
        })
        .catch(function (error) {
            errMsg.textContent = error + ' Try reloadin the page';
        });

}

if (document.getElementById('save1') && document.getElementById('save2')) {
    document.getElementById('save1').addEventListener('click', save);
    document.getElementById('save2').addEventListener('click', save);
    document.getElementById('save2').removeAttribute("style");
}

// Hook up the delete button to log to the console
if (document.getElementById('remove')) {
    document.getElementById('remove').addEventListener('click', function () {
        var e = docEditor.getValue();
        if (confirm('Delete this ' + originalTitle + '?')) {
            fetch("", {
                method: 'DELETE',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'CSRF-Token': csrfToken
                },
            }).then(function (response) {
                if (response.status == 200) {
                    infoMsg.textContent = "Deleted ";
                    errMsg.textContent = "";
                    window.location = "./";
                } else {
                    errMsg.textContent = "Error " + response.statusText;
                    infoMsg.textContent = "";
                }
            });
        }
    });
}

// hack to auto generate description/ needs improvement
var autoButton = document.getElementById('auto');

var descDiv = document.querySelector('[data-schemapath="root.description.description_data"] div ');
if (descDiv) {

    descDiv.appendChild(autoButton);
    autoButton.removeAttribute("style");
}

autoButton.addEventListener('click', function () {
    var d = docEditor.getEditor('root.description.description_data');
    var docJSON = docEditor.getValue();
    desc = d.getValue();
    if (d) {
        var i = desc.length;
        while (i--) {
            if (desc[i].value.length === 0) {
                desc.splice(i, 1);
            }
        }
        desc.push({
            lang: "eng",
            value: "A " + docJSON.problemtype.problemtype_data[0].description[0].value + " vulnerability in ____COMPONENT____ of " + textUtil.getProductList(docJSON) +
                " allows ____ATTACKER/ATTACK____ to cause ____IMPACT____."
        });
        desc.push({
            lang: "eng",
            value: "Affected releases are " + textUtil.getAffectedProductString(docJSON) + '.'
        });
        d.setValue(desc);
    } else {

    }
});

var originalTitle = document.title;
var changes = true;
var insync = false;

function getDocID() {
    var idEditor = docEditor.getEditor('root.' + idpath);
    if (idEditor) {
        var val = idEditor.getValue();
        if (val) {
            return val;
        } else {
            return 'Vulnogram';
        }
    }
}

function incChanges() {
    if (!insync) {
        changes = true;
        infoMsg.textContent = 'Edited';
        var idEditor = docEditor.getEditor('root.' + idpath);
        document.title = '• ' + getDocID();
        errMsg.textContent = '';
        if (document.getElementById("save1")) {
            save2.className = "button safe save"
            save1.className = "button tabbutton safe save";
        }
    }
}

function incEditorChanges() {
    if (selected == 'editorTab') {
        incChanges();
    }
}

function incSourceChanges() {
    if (selected == 'sourceTab') {
        incChanges();
    }
}

docEditor.watch('root', incEditorChanges);

//trigger validation when either editor or Source editor is deselected
function setupDeselectEvent() {
    var tabs = document.getElementsByName("tabs");
    for (var i = 0; i < tabs.length; i++) {
        t = tabs[i];
        t.addEventListener('change', function () {
            clicked = this.id;
            //console.log(selected + ' -to-> ' + clicked);
            if (selected != clicked) {
                switch (selected) {
                    case "editorTab":
                        docEditorValid();
                        syncContents(clicked);
                        break;
                    case "sourceTab":
                        if (sourceEditorValid()) {
                            // for some setting value of GUI Editor and calling immediate validation returns no erroer
                            // run validation against the actual JSON being copied to Editor
                            var j = source2editor();
                            docEditorValid(j);
                            syncContents(clicked);
                        } else {
                            clicked = "sourceTab";
                            document.getElementById("sourceTab").checked = true;
                        }
                        break;
                    default:
                        syncContents(clicked);
                }
            }
            selected = clicked;
        });
    }
}

setupDeselectEvent();

function loadCVE(value) {
    var realId = value.match(/(CVE-(\d{4})-(\d{1,12})(\d{3}))/);
    if (realId) {
        var id = realId[1];
        var year = realId[2];
        var bucket = realId[3];
        fetch('https://raw.githubusercontent.com/CVEProject/cvelist/master/' + year + '/' + bucket + 'xxx/' + id + '.json', {
                method: 'GET',
                credentials: 'omit',
                headers: {
                    'Accept': 'application/json, text/plain, */*'
                },
                redirect: 'error'
            })
            .then(function (response) {
                if (!response.ok) {
                    errMsg.textContent = "Failed to load valid CVE JSON";
                    infoMsg.textContent = "";
                    throw Error(id + ' ' + response.statusText);
                }
                return response.json();
            })
            .then(function (res) {
                if (res.CVE_data_meta) {

                    // workaround for JSON Editor issue with clearing arrays
                    // https://github.com/jdorn/json-editor/issues/617
                    docEditor.destroy();
                    docEditor = new JSONEditor(document.getElementById('editor'), docEditorOptions);
                    docEditor.root.setValue(res, true);
                    infoMsg.textContent = "Imported " + id + " from git";
                    console.log('Imported from GIT');
                    errMsg.textContent = "";
                    document.title = id;
                    if (document.getElementById("save1")) {
                        save2.className = "button save"
                        save1.className = "button tabbutton save";
                    }
                    document.getElementById("editorTab").checked = true;
                    changes = 0;
                    postUrl = "./new";
                } else {
                    errMsg.textContent = "Failed to load valid CVE JSON";
                    infoMsg.textContent = "";
                }
            })
            .catch(function (error) {
                errMsg.textContent = error;
            })
    } else {
        errMsg.textContent = "CVE ID required";
    }
}

function copyText(element) {
    if (document.selection) {
        var range = document.body.createTextRange();
        range.moveToElementText(element);
        range.select();
        document.execCommand("copy");
        document.selection.empty();
        infoMsg.textContent = 'Copied JSON to clipboard';
    } else if (window.getSelection) {
        var range = document.createRange();
        range.selectNode(element);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        document.execCommand("copy");
        window.getSelection().removeAllRanges();
        infoMsg.textContent = 'Copied JSON to clipboard';
    }
}

function downloadText(element, link) {
    var file = new File([element.textContent], getDocID() + '.json', {
        type: "text/plain",
        lastModified: new Date()
    });
    link.href = URL.createObjectURL(file);
    link.download = file.name;
}