function copyTextToClipboard(elem) {
    elem.setAttribute("data-is-being-copied", "");
    if (navigator.clipboard) {
        navigator.clipboard.writeText(elem.textContent || "");
    } else {
        const selection = window.getSelection();
        if (selection == null) {
            return;
        }
        selection.removeAllRanges();
        const range = document.createRange();
        range.selectNodeContents(elem);
        selection.addRange(range);
        document.execCommand("copy");
        selection.removeAllRanges();
    }

    setTimeout(() => {
        elem.removeAttribute("data-is-being-copied");
    }, 200);
}


class CopyButton extends HTMLElement {
    constructor() {
        super();
    }

    connectedCallback() {
        this.attachShadow({
            mode: "open"
        });
        const style = document.createElement("style");
        style.textContent = `
:host {
    display: inline-block;
    height: 2rem;
    width: 2rem;
}

button {
    height: 100%;
    width: 100%;
    padding: 0.5rem;
    border: none;
    border-radius: 5px;
    position: relative;
    cursor: pointer;
}

button:not([data-show-checkmark]) > :not(:first-child) {
    display: none;
}

button[data-show-checkmark] > :first-child {
    display: none;
}

.copied-message {
    font-size: 0.8rem;
    background-color: black;
    color: white;
    padding: 5px;
    border-radius: 5px;
    position: absolute;
    right: calc(100% + 5px);
    top: 0;
    margin: 0;
}
`;
        this.shadowRoot.appendChild(style);
        this.button = document.createElement("button");
        this.button.addEventListener("click", () => this.onClick());
        this.button.innerHTML = `
<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16">
  <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1z"/> <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0z"/>
</svg>
<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16">
  <path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l3.052 3.093 5.4-6.425z"/>
</svg>
`;
        this.shadowRoot.appendChild(this.button);
        const copied = document.createElement("div");
        copied.textContent = "Copied!";
        copied.className = "copied-message";
        this.button.appendChild(copied);
    }

    onClick() {
        this.button.dataset.showCheckmark = "";
        this.dataset.justCopied = "";
        setTimeout(() => {
            delete this.button.dataset.showCheckmark;
            delete this.dataset.justCopied;
        }, 2000);
        const textElem = document.getElementById(this.getAttribute("target-id"));
        if (textElem) {
            copyTextToClipboard(textElem);
        }
    }
}
customElements.define("copy-button", CopyButton);
