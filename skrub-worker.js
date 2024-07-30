importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.js");

function isParquet(fileName) {
    return fileName.endsWith(".parquet");
}

async function startPyodide() {
    self.postMessage({
        kind: "LOADING_PYODIDE"
    });
    const startTime = performance.now();
    self.pyodide = await loadPyodide();
    await self.pyodide.loadPackage("micropip");
    const micropip = self.pyodide.pyimport("micropip");
    await micropip.install(["pandas", "fastparquet", "matplotlib",
        "skrub-0.3.0.dev0-py3-none-any.whl?versiond25a",
        "clevercsv-0.8.2-cp312-cp312-pyodide_2024_0_wasm32.whl"
    ]);
    await pyodide.runPython(`
import io
import os
import traceback
import codecs

os.environ["MPLBACKEND"] = "AGG"

import pandas as pd
import clevercsv
import chardet
from chardet.universaldetector import UniversalDetector
import skrub
import js

def escape_str_to_py(escape_str):
    if escape_str == "none":
        return None
    return escape_str

def escape_py_to_str(escape_py):
    if escape_py is None:
        return "none"
    return escape_py
`);
    const endTime = performance.now();
    console.log(`Loading pyodide took ${(endTime - startTime) / 1000} seconds`);
    self.postMessage({
        kind: "DONE_LOADING_PYODIDE"
    });
}


async function getReport() {
    await pyodideLoaded;
    self.postMessage({
        kind: "COMPUTING_REPORT",
        fileInfo: self.fileInfo,
    });

    await pyodide.runPython(`
report_error = report = None

def get_report():
    global report
    stream = io.BytesIO(js.data.to_py())
    if js.fileInfo.isParquet:
        df = pd.read_parquet(stream)
    else:
        df = pd.read_csv(
            stream,
            encoding=js.csvParams.encoding,
            sep=js.csvParams.delimiter,
            escapechar=escape_str_to_py(js.csvParams.escape),
            quotechar=js.csvParams.quote,
            encoding_errors="replace",
            na_values=["?"],
            keep_default_na=True,
        )
    report = skrub.TableReport(df, title=js.fileInfo.name).html_snippet()
try:
    get_report()
except Exception as e:
    report_error = traceback.format_exc()
    report = None
             `);

    self.postMessage({
        kind: "DONE_COMPUTING_REPORT",
        report: pyodide.globals.get("report"),
        error: pyodide.globals.get("report_error"),
        fileInfo: self.fileInfo,
        pythonSnippets: pythonSnippets(self.fileInfo, self.csvParams),
    });
}


async function csvPreview() {
    await pyodideLoaded;
    self.postMessage({
        kind: "COMPUTING_CSV_PREVIEW",
        fileInfo: self.fileInfo
    });
    await pyodide.runPython(`
csv_params = {}
encoding = delimiter = quote = escape = None
error = error_type = decoded_text = preview = None

def get_preview():
    global encoding, delimiter, quote, escape, decoded_text, preview
    data = js.data.to_py()
    if js.sniff:
        detector = UniversalDetector()
        detector.feed(data[:70_000])
        detector.close()
        encoding = detector.result["encoding"]
        if encoding in (None, "ascii"):
            encoding = "utf-8"
        csv_params["encoding"] = encoding
        decoder = codecs.getincrementaldecoder(encoding)()
        decoded_text = decoder.decode(data[:250_000])
        dialect = clevercsv.Sniffer().sniff(decoded_text)
        decoded_text = decoded_text[:4000]
        delimiter = dialect.delimiter or ","
        csv_params["delimiter"] = delimiter
        quote = dialect.quotechar or '"'
        csv_params["quote"] = quote
        escape = dialect.escapechar or None
        csv_params["escape"] = escape_py_to_str(escape)
    else:
        encoding = js.csvParams.encoding
        delimiter = js.csvParams.delimiter
        escape = escape_str_to_py(js.csvParams.escape)
        quote = js.csvParams.quote
        decoder = codecs.getincrementaldecoder(encoding)()
        decoded_text = decoder.decode(data[:4000])

    stream = io.BytesIO(data)
    df = pd.read_csv(
        stream,
        encoding=encoding,
        sep=delimiter,
        escapechar=escape,
        quotechar=quote,
        nrows=5,
        na_values=["?"],
        keep_default_na=True,
    )
    preview = df.to_html().replace(
        'class="dataframe"', 'class="pure-table pure-table-striped"'
    )

try:
    get_preview()
except Exception as e:
    error = traceback.format_exc()
    error_type = e.__class__.__name__

`);
    let computeReport = false;
    const data = {
        kind: "DONE_COMPUTING_CSV_PREVIEW",
        raw: pyodide.globals.get("decoded_text"),
        preview: pyodide.globals.get("preview"),
        errorType: pyodide.globals.get("error_type"),
        error: pyodide.globals.get("error"),
        fileInfo: self.fileInfo,
    };
    if (self.sniff) {
        const proxy = pyodide.globals.get("csv_params");
        try {
            self.csvParams = proxy.toJs({
                create_proxies: false,
                dict_converter: Object.fromEntries
            });
        } finally {
            proxy.destroy();
        }
        data.sniffedCsvParams = self.csvParams;
        if (data.error === undefined) {
            computeReport = true;
        }
    }
    data.isComputingReport = computeReport;
    self.postMessage(data);
    if (computeReport) {
        getReport();
    }
}


function readFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            resolve(reader.result);
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

function pythonReadFileSnippet(fileInfo, csvParams, moduleName) {
    if (fileInfo.isParquet) {
        switch (moduleName) {
            case "pandas":
                return `
df = pd.read_parquet('${fileInfo.name}')
`;
            case "polars":
                return `
df = pl.read_parquet('${fileInfo.name}')
`;
        }

    }
    const delimiter = csvParams.delimiter === "\t" ? "'\\t'" :
        `'${csvParams.delimiter}'`;
    const escape = csvParams.escape === "none" ? "None" : `'\\\\'`;
    const quote = csvParams.quote === '"' ? `'"'` : `"'"`;
    switch (moduleName) {
        case "pandas":
            return `
df = pd.read_csv(
    '${fileInfo.name}',
    encoding='${csvParams.encoding}',
    sep=${delimiter},
    quotechar=${quote},
    escapechar=${escape},
)
`;
        case "polars":
            return `
df = pl.read_csv(
    '${fileInfo.name}',
    encoding='${csvParams.encoding}',
    separator=${delimiter},
    quote_char=${quote},
)
`;
    }
}

function pythonSnippets(fileInfo, csvParams) {
    const snippets = {};
    const reportGenSnippet = `
report = TableReport(df, title='${fileInfo.name}')
report.open()
`;
    snippets.pandas = {
        text: `import pandas as pd
from skrub import TableReport

` + pythonReadFileSnippet(fileInfo, csvParams, "pandas") + reportGenSnippet
    };

    snippets.polars = {
        text: `import polars as pl
from skrub import TableReport

` + pythonReadFileSnippet(fileInfo, csvParams, "polars") + reportGenSnippet,
        // polars does not support escapechar, see
        // https://github.com/pola-rs/polars/issues/3074#issuecomment-1178778783

        warningEscapeChar: !fileInfo.isParquet && csvParams.escape !== "none"
    };

    return snippets;
}


async function FILE_SELECTED(data) {
    let fileName = data.file.name;
    self.fileInfo = {
        name: fileName,
        size: data.file.size,
        isParquet: self.isParquet(fileName)
    };
    self.postMessage({
        kind: "LOADING_FILE",
        fileInfo: self.fileInfo,
    });
    self.data = null;
    self.data = await readFile(data.file);
    self.postMessage({
        kind: "DONE_LOADING_FILE",
        fileInfo: self.fileInfo,
    });
    if (self.fileInfo.isParquet) {
        getReport();
    } else {
        self.sniff = true;
        csvPreview();
    }
}


function CSV_PARAMS(data) {
    if (self.csvParams !== data.csvParams) {
        self.sniff = false;
        self.csvParams = data.csvParams;
        csvPreview();
    }
}


async function CSV_COMMIT(data) {
    getReport();
}

const pyodideLoaded = startPyodide();

self.onmessage = (e) => {
    self[e.data.kind](e.data);
};
