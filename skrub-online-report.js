const allEncodings = ['ascii', 'big5', 'big5hkscs', 'cp037', 'cp273', 'cp424', 'cp437',
    'cp500', 'cp720', 'cp737', 'cp775', 'cp850', 'cp852', 'cp855', 'cp856', 'cp857',
    'cp858', 'cp860', 'cp861', 'cp862', 'cp863', 'cp864', 'cp865', 'cp866', 'cp869',
    'cp874', 'cp875', 'cp932', 'cp949', 'cp950', 'cp1006', 'cp1026', 'cp1125',
    'cp1140', 'cp1250', 'cp1251', 'cp1252', 'cp1253', 'cp1254', 'cp1255', 'cp1256',
    'cp1257', 'cp1258', 'euc-jp', 'euc-jis-2004', 'euc-jisx0213', 'euc-kr',
    'gb2312', 'gbk', 'gb18030', 'hz', 'iso2022-jp', 'iso2022-jp-1', 'iso2022-jp-2',
    'iso2022-jp-2004', 'iso2022-jp-3', 'iso2022-jp-ext', 'iso2022-kr', 'latin-1',
    'iso8859-2', 'iso8859-3', 'iso8859-4', 'iso8859-5', 'iso8859-6', 'iso8859-7',
    'iso8859-8', 'iso8859-9', 'iso8859-10', 'iso8859-11', 'iso8859-13',
    'iso8859-14', 'iso8859-15', 'iso8859-16', 'johab', 'koi8-r', 'koi8-t', 'koi8-u',
    'kz1048', 'mac-cyrillic', 'mac-greek', 'mac-iceland', 'mac-latin2', 'mac-roman',
    'mac-turkish', 'ptcp154', 'shift-jis', 'shift-jis-2004', 'shift-jisx0213',
    'utf-32', 'utf-32-be', 'utf-32-le', 'utf-16', 'utf-16-be', 'utf-16-le', 'utf-7',
    'utf-8', 'utf-8-sig'
];

function setInnerHTML(elem, html) {
    elem.innerHTML = html;

    Array.from(elem.querySelectorAll("script"))
        .forEach(oldScriptEl => {
            const newScriptEl = document.createElement("script");

            Array.from(oldScriptEl.attributes).forEach(attr => {
                newScriptEl.setAttribute(attr.name, attr.value);
            });

            const scriptText = document.createTextNode(oldScriptEl.innerHTML);
            newScriptEl.appendChild(scriptText);

            oldScriptEl.parentNode.replaceChild(newScriptEl, oldScriptEl);
        });
}

class App {

    static handlerClasses = [];

    constructor() {
        this.handlers = [];
        for (let elem of document.querySelectorAll("[data-handler]")) {
            const cls = App.handlerClasses[elem.dataset.handler];
            this.handlers.push(new cls(elem, this));
        }

        this.worker = new Worker("skrub-worker.js?__skrub_ef40__");
        this.worker.onmessage = (e) => {
            this.receive(e.data);
        };
    }

    emit(data) {
        setTimeout(() => {
            this.receive(data);
        });
        this.worker.postMessage(data);
    }

    receive(data) {
        console.log(data.kind);
        for (let handler of this.handlers) {
            handler.receive(data);
        }
    }

    static register(cls) {
        App.handlerClasses[cls.name] = cls;
    }

}

class Handler {

    hideUpon = [];
    showUpon = [];
    clearUpon = [];

    constructor(elem, app) {
        this.elem = elem;
        this.app = app;
        this.preHandlers = [];
    }

    receive(data) {
        for (let handler of this.preHandlers) {
            handler.receive(data);
        }
        if (this.hideUpon.includes(data.kind)) {
            this.hide();
        }
        if (this.showUpon.includes(data.kind)) {
            this.show();
        }
        if (this.clearUpon.includes(data.kind)) {
            this.clear();
        }
        if (data.kind in this){
            this[data.kind](data);
        }
    }

    emit(data) {
        this.app.emit(data);
    }

    hide() {
        this.elem.setAttribute("data-hidden", "");
    }

    show() {
        this.elem.removeAttribute("data-hidden");
    }

    clear() {
        this.elem.innerHTML = "";
    }

    disable() {
        this.elem.disabled = true;
        this.elem.setAttribute("data-disabled", "");
    }

    enable() {
        this.elem.disabled = false;
        this.elem.removeAttribute("data-disabled");
    }
}

class FileInput extends Handler {
    constructor(elem, app) {
        super(elem, app);
        this.preHandlers.push(new DisableDuringComputation(elem, app));
        this.elem.addEventListener("change", () => {
            this.fileSelected();
        });
    }

    fileSelected() {
        const allSelectedFiles = this.elem.files;
        if (allSelectedFiles.length !== 1) {
            return;
        }
        const selectedFile = allSelectedFiles[0];
        console.log(this);
        this.emit({
            kind: "FILE_SELECTED",
            file: selectedFile,
        });
    }
}
App.register(FileInput);


class FileNameDisplay extends Handler {
    FILE_SELECTED(data) {
        this.elem.textContent = data.file.name;
    }
}
App.register(FileNameDisplay);

class LargeFileWarning extends Handler {
    FILE_SELECTED(data) {
        const mb = Math.floor(data.file.size / 1e6);
        this.elem.querySelector("[data-role='file-size-display']").textContent =
            `${mb} MB`;
        if (mb >= 100) {
            this.show();
        } else {
            this.hide();
        }
    }
}
App.register(LargeFileWarning);

class StatusContainer extends Handler {
    FILE_SELECTED(data) {
        this.show();
    }

    LOADING_PYODIDE(data) {
        this.postStatus(
            'The Pyodide python distribution is loading and importing packages. ' +
            'This can take around 30 seconds.', data.kind);
    }

    DONE_LOADING_PYODIDE(data) {
        this.removeStatus("LOADING_PYODIDE");
    }

    LOADING_FILE(data) {
        this.postStatus(`Loading '${data.fileInfo.name}'.`, data.kind);
    }

    DONE_LOADING_FILE(data) {
        this.removeStatus("LOADING_FILE");
    }

    COMPUTING_CSV_PREVIEW(data) {
        this.postStatus("Parsing CSV.", data.kind);
    }

    DONE_COMPUTING_CSV_PREVIEW(data) {
        this.removeStatus("COMPUTING_CSV_PREVIEW");
    }

    COMPUTING_REPORT(data) {
        this.postStatus(`Computing the report for '${data.fileInfo.name}'.`, data
            .kind);
    }

    DONE_COMPUTING_REPORT(data) {
        this.removeStatus("COMPUTING_REPORT");
    }

    postStatus(content, kind, withLoader = true) {
        const div = document.createElement("div");
        div.className = "status-display";
        div.setAttribute("data-kind", kind);
        const contentDiv = document.createElement("div");
        contentDiv.textContent = content;
        div.appendChild(contentDiv);
        if (withLoader) {
            const loader = document.createElement("div");
            loader.className = "loader";
            div.appendChild(loader);
        }
        this.elem.appendChild(div);
    }

    removeStatus(kind) {
        this.elem.querySelectorAll(
            `[data-kind="${kind}"]`).forEach((elem) => {
            elem.remove();
        });
    }
}
App.register(StatusContainer);

class CsvDialog extends Handler {
    hideUpon = ["FILE_SELECTED"];

    DONE_COMPUTING_CSV_PREVIEW(data) {
        this.elem.setAttribute("open", "");
        if (!data.isComputingReport) {
            this.show();
        }
    }

    DONE_COMPUTING_REPORT(data) {
        if (data.error !== undefined) {
            this.elem.setAttribute("open", "");
        } else {
            this.elem.removeAttribute("open");
        }
        if (!data.fileInfo.isParquet) {
            this.show();
        }
    }
}
App.register(CsvDialog);

class DisableDuringComputation extends Handler {
    receive(data) {
        super.receive(data);
        if (["FILE_SELECTED", "CSV_COMMIT"].includes(data.kind)) {
            this.disable();
        }
        if (["DONE_COMPUTING_REPORT"].includes(data.kind)) {
            this.enable();
        }
        if (data.kind == "DONE_COMPUTING_CSV_PREVIEW" && !data.isComputingReport) {
            this.enable();
        }
    }
}
App.register(DisableDuringComputation);

class CsvDialogForm extends Handler {

    constructor(elem, app) {
        super(elem, app);
        for (let paramInput of this.elem.elements) {
            paramInput.addEventListener("change", () => {
                this.csvParamsChanged();
            });
        }

        const encodingSelect = this.elem.elements["encoding"];
        for (let encoding of allEncodings) {
            const option = document.createElement("option");
            option.textContent = encoding;
            if (encoding === "utf-8") {
                option.setAttribute("selected", "");
            }
            encodingSelect.appendChild(option);
        }
    }

    FILE_SELECTED(data) {
        this.elem.reset();
    }

    DONE_COMPUTING_CSV_PREVIEW(data) {
        if (data.sniffedCsvParams === undefined) {
            return;
        }
        for (let paramInput of this.elem.elements) {
            if (data.sniffedCsvParams[paramInput.name] !== undefined) {
                paramInput.value = data.sniffedCsvParams[paramInput.name];
            }
        }
    }

    getCsvParams() {
        const result = {};
        for (let paramInput of this.elem.elements) {
            result[paramInput.name] = paramInput.value;
        }
        return result;
    }

    csvParamsChanged() {
        this.emit({
            kind: "CSV_PARAMS",
            csvParams: this.getCsvParams()
        });
    }
}
App.register(CsvDialogForm);


class CsvParamsSubmit extends Handler {
    constructor(elem, app) {
        super(elem, app);
        this.preHandlers.push(new DisableDuringComputation(elem, app));
        this.elem.addEventListener("click", () => {
            this.emit({
                kind: "CSV_COMMIT"
            });
        });
    }

    DONE_COMPUTING_CSV_PREVIEW(data) {
        if (data.error !== undefined) {
            this.disable();
        } else {
            this.enable();
        }
    }
}
App.register(CsvParamsSubmit);

class CsvTextPreview extends Handler {

    hideUpon = ["FILE_SELECTED", "CSV_PARAMS"];
    clearUpon = ["FILE_SELECTED", "CSV_PARAMS"];

    clear() {
        this.elem.querySelector("[data-role='csv-text-display']").innerHTML = "";
    }

    DONE_COMPUTING_CSV_PREVIEW(data) {
        const displayElem = this.elem.querySelector("[data-role='csv-text-display']");
        if (data.raw === undefined) {
            return;
        }
        displayElem.textContent = data.raw;
        this.show();
    }
}
App.register(CsvTextPreview);

class CsvTablePreview extends Handler {

    hideUpon = ["FILE_SELECTED", "CSV_PARAMS"];
    clearUpon = ["FILE_SELECTED", "CSV_PARAMS"];

    clear() {
        this.elem.querySelector("[data-role='csv-table-display']").innerHTML = "";
    }

    DONE_COMPUTING_CSV_PREVIEW(data) {
        const displayElem = this.elem.querySelector("[data-role='csv-table-display']");
        if (data.preview === undefined) {
            return;
        }
        displayElem.innerHTML = data.preview;
        this.show();
    }
}
App.register(CsvTablePreview);


class CsvPreviewError extends Handler {

    hideUpon = ["FILE_SELECTED", "CSV_PARAMS"];
    clearUpon = ["FILE_SELECTED", "CSV_PARAMS"];

    clear() {
        this.elem.querySelector("[data-role='file-name-display']").innerHTML = "";
        this.elem.querySelector("[data-role='csv-error-display']").innerHTML = "";
    }

    DONE_COMPUTING_CSV_PREVIEW(data) {
        if (data.error === undefined) {
            return;
        }
        const fileNameDisplay = this.elem.querySelector("[data-role='file-name-display']");
        fileNameDisplay.textContent = data.fileInfo.name;
        this.elem.querySelector("[data-role='csv-error-display']").textContent = data
            .error;
        this.show();
    }
}
App.register(CsvPreviewError);

class PythonSnippets extends Handler {

    hideUpon = ["FILE_SELECTED", "CSV_PARAMS", "CSV_COMMIT"];
    clearUpon = ["FILE_SELECTED", "CSV_PARAMS", "CSV_COMMIT"];

    clear() {
        this.elem.querySelector("[data-role='pandas-snippet-display']").innerHTML = "";
        this.elem.querySelector("[data-role='polars-snippet-display']").innerHTML = "";
        this.elem.querySelector("[data-role='polars-escape-warning']").setAttribute(
            "data-hidden", "");

    }

    DONE_COMPUTING_REPORT(data) {
        if (data.error !== undefined) {
            return;
        }
        if (data.pythonSnippets.polars.warningEscapeChar) {
            this.elem.querySelector("[data-role='polars-escape-warning']").removeAttribute(
                "data-hidden");
        } else {
            this.elem.querySelector("[data-role='polars-escape-warning']").setAttribute(
                "data-hidden", "");
        }
        this.elem.querySelector("[data-role='pandas-snippet-display']").textContent = data
            .pythonSnippets.pandas.text;
        this.elem.querySelector("[data-role='polars-snippet-display']").textContent = data
            .pythonSnippets.polars.text;
        this.show();
    }
}
App.register(PythonSnippets);

class Report extends Handler {

    hideUpon = ["FILE_SELECTED", "CSV_PARAMS", "CSV_COMMIT"];
    clearUpon = ["FILE_SELECTED", "CSV_PARAMS", "CSV_COMMIT"];

    DONE_COMPUTING_REPORT(data) {
        if (data.error !== undefined) {
            return;
        }
        setInnerHTML(this.elem, data.report);
        this.show();
    }
}
App.register(Report);

class ReportError extends Handler {

    hideUpon = ["FILE_SELECTED", "CSV_PARAMS", "CSV_COMMIT"];
    clearUpon = ["FILE_SELECTED", "CSV_PARAMS", "CSV_COMMIT"];

    clear() {
        this.elem.querySelector("[data-role='file-name-display']").innerHTML = "";
        this.elem.querySelector("[data-role='report-error-display']").innerHTML = "";
    }

    DONE_COMPUTING_REPORT(data) {
        if (data.error === undefined) {
            return;
        }
        const fileNameDisplay = this.elem.querySelector("[data-role='file-name-display']");
        fileNameDisplay.textContent = data.fileInfo.name;
        this.elem.querySelector("[data-role='report-error-display']").textContent = data
            .error;
        this.show();
    }
}
App.register(ReportError);


const app = new App();
