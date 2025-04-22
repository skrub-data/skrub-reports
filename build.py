#! /usr/bin/env python

import argparse
from pathlib import Path
import shutil
import re
import secrets
import time

import jinja2
import pandas as pd
from skrub import datasets as skrub_data
from sklearn import datasets as sklearn_data
from skrub import TableReport


NAV_LINKS = [("Demo", "index.html"), ("Examples", "examples/index.html")]


def write(text, path):
    path.write_text(bust(text), encoding="utf-8")


@jinja2.pass_context
def relative(context, path):
    current_page = context["current_page"]
    depth = len(current_page.split("/")) - 1
    parts = [".."] * depth + path.split("/")
    return "/".join(parts)


def get_jinja_env():
    env = jinja2.Environment(
        loader=jinja2.FileSystemLoader(
            [REPO, REPO / "_includes"],
            encoding="UTF-8",
        ),
        autoescape=True,
    )
    env.filters["relative"] = relative
    env.globals = {
        "nav_links": NAV_LINKS,
    }
    return env


def bust(text):
    return re.sub(r"\?__skrub_[a-zA-Z0-9]+__", f"?__skrub_{VERSION}__", text)


def get_datasets():
    AMES_HOUSING_CSV = (
        "https://www.openml.org/data/get_csv/20649135/file2ed11cebe25.arff"
    )
    datasets = [("AMES Housing", (lambda: pd.read_csv(AMES_HOUSING_CSV)))]
    skrub_dataset_names = [
        "employee_salaries",
        "medical_charge",
        "traffic_violations",
        "drug_directory",
    ]
    for name in skrub_dataset_names:

        def fetch(name=name):
            return getattr(skrub_data, f"fetch_{name}")().X

        datasets.append((name, fetch))
    sklearn_dataset_names = ["titanic"]
    for name in sklearn_dataset_names:

        def fetch(name=name):
            return sklearn_data.fetch_openml(
                name, as_frame=True, parser="auto", version=1
            ).frame

        datasets.append((name, fetch))
    return datasets


def add_report(name, fetcher):
    if ARGS.no_reports:
        html = '<div class="report-placeholder">report</div>'
        elapsed = 0
    else:
        df = fetcher()
        print(f"making report for {name}")
        pretty_name = name.replace("_", " ").capitalize()
        start = time.time()
        html = TableReport(
            df, title=pretty_name, max_plot_columns=None, max_association_columns=None
        ).html_snippet()
        elapsed = time.time() - start
        print(f"{name} took {elapsed:.2f}s")
    report_template = ENV.get_template("example-report.html")
    current_page = f"examples/{name}.html"
    html = report_template.render(
        nav_links=NAV_LINKS + [(name, current_page)],
        current_page=current_page,
        report=html,
        time=elapsed,
    )
    write(html, EXAMPLES_DIR / f"{name}.html")


def build_examples():
    datasets = get_datasets()
    for name, fetcher in datasets:
        add_report(name, fetcher)

    examples_index = ENV.get_template("examples-index.html")
    html = examples_index.render(
        report_names=[name for name, _ in datasets], current_page="examples/index.html"
    )
    write(html, EXAMPLES_DIR / "index.html")


def build_pages():
    all_pages = REPO.glob("*.html")
    for page in all_pages:
        template = ENV.get_template(page.name)
        rendered = template.render(current_page=f"{page.name}")
        write(rendered, BUILD_DIR / page.name)

    for ext in ["css", "js", "svg"]:
        for file_path in REPO.glob(f"*.{ext}"):
            text = file_path.read_text("utf-8")
            write(text, BUILD_DIR / file_path.name)

    for asset in REPO.glob(f"*.whl"):
        shutil.copyfile(asset, BUILD_DIR / asset.name)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--no_reports", help="skip building example reports", action="store_true"
    )
    ARGS = parser.parse_args()

    REPO = Path(__file__).parent.resolve()
    BUILD_DIR = REPO / "_build"
    if BUILD_DIR.is_dir():
        shutil.rmtree(BUILD_DIR)
    BUILD_DIR.mkdir()

    EXAMPLES_DIR = BUILD_DIR / "examples"
    EXAMPLES_DIR.mkdir()

    VERSION = secrets.token_hex()[:4]

    ENV = get_jinja_env()

    build_pages()
    build_examples()
