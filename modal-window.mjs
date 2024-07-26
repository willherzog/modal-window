/**
 * A class for handling modal window/dialog functionality.
 *
 * @author Will Herzog <willherzog@gmail.com>
 */
export default class ModalWindow
{
	//---- Static properties ----//

	static #lastIndex = 0;
	static #layer = 0;
	static #store = [];
	static #baseZindex = 100;

	/**
	 * @returns {string}
	 */
	static get mainClass() {
		return 'modal-window';
	}

	/**
	 * @returns {string}
	 */
	static get maskClass() {
		return 'modal-mask';
	}

	/**
	 * @returns {string}
	 */
	static get loadingClass() {
		return 'loading';
	}

	/**
	 * When a first (or "outermost") modal dialog is opened, all children
	 * of the <body> element which are not already inert are made inert
	 * in order to trap focus within the modal dialog.
	 *
	 * Adding this HTML class to any such child element will exempt it
	 * from being made inert while any modal dialogs are open.
	 *
	 * @returns {string}
	 */
	static get inertExemptClass() {
		return 'wh-inert-exempt';
	}

	/**
	 * @param {number} zIndexValue
	 */
	static setBaseZindex (zIndexValue) {
		if( typeof zIndexValue !== 'number' ) {
			throw new TypeError(`Expected integer, but got ${typeof zIndexValue} instead.`);
		}

		ModalWindow.#baseZindex = zIndexValue;
	}

	/**
	 * @param {boolean} [pendingOnly]
	 *
	 * @returns {ModalWindow | null}
	 */
	static getMostRecent(pendingOnly = false) {
		let i = ModalWindow.#lastIndex;

		while( i > 0 ) {
			const modalWindowEntry = ModalWindow.#store[i];

			if( (typeof modalWindowEntry !== 'undefined')
				&& (!pendingOnly || modalWindowEntry.isPending) )
			{
				return modalWindowEntry;
			}

			i--;
		}

		return null;
	}

	/**
	 * @param {ModalWindow} modal
	 */
	static #setLabelledByAttr(modal) {
		const firstHeading = modal.get().querySelector('h1,h2,h3,h4,h5,h6');

		if( firstHeading === null ) {
			return;
		}

		let headingIdAttr = firstHeading.getAttribute('id');

		if( headingIdAttr === null ) {
			headingIdAttr = `modal-${modal.index}-heading`;

			firstHeading.setAttribute('id', headingIdAttr);
		}

		modal.get().setAttribute('aria-labelledby', headingIdAttr);
	}

	//---- Instance properties ----//

	/** @type {number} */
	#index;
	/** @type {object} */
	#config;
	/** @type {string} */
	#uniqueClass;
	/** @type {HTMLElement} */
	#dialogNode;
	/** @type {HTMLElement} */
	#maskNode;
	/** @type {boolean} */
	#isPending;

	#deferredId;
	#deferredClass;
	#windowScrollHandler;

	/**
	 * @param {string | null} [id]
	 * @param {string | null} [htmlClass]
	 * @param {string | object | null} [htmlContent]
	 * @param {object | boolean | null} [options]
	 */
	constructor(id = null, htmlClass = null, htmlContent = null, options = null) {
		if( typeof options === 'boolean' ) {
			options = {
				isAlertDialog: options
			};
		} else if( options === null && typeof htmlContent === 'object' ) {
			options = htmlContent;
			htmlContent = null;
		} else if( typeof options !== 'object' ) {
			options = {};
		}

		this.#config = {
			isAlertDialog: false,
			trapFocus: true,
			lockWindowScroll: true,
			closeOnMaskClick: true,
			labelByFirstHeading: true,
			...options
		};

		ModalWindow.#lastIndex++;

		this.#index = ModalWindow.#lastIndex;
		this.#uniqueClass = `modal-${this.#index}`;

		if( ModalWindow.#store.length > 0 ) {
			ModalWindow.#layer++;
		}

		/**
		 * @param {string} htmlString
		 *
		 * @returns {HTMLElement}
		 */
		function createHtmlElement(htmlString) {
			const template = document.createElement('template');

			template.innerHTML = htmlString;

			return template.content.children[0];
		}

		let dialogHtml = `<div class="${ModalWindow.mainClass} ${this.#uniqueClass}"`;

		dialogHtml += ` style="position: fixed; z-index: ${(ModalWindow.#baseZindex + ModalWindow.#layer)}; max-width: 98vw; max-height: 98vh; overflow-y: auto; overscroll-behavior: contain;"`;
		dialogHtml += ` role="${this.#config.isAlertDialog ? 'alertdialog' : 'dialog'}"></div>`;

		let backdropHtml = `<div class="${ModalWindow.maskClass} ${this.#uniqueClass}"`;

		backdropHtml += ` style="position: fixed; top: 0; bottom: 0; left: 0; right: 0; z-index: ${(ModalWindow.#baseZindex + ModalWindow.#layer - 1)};"`;

		if( this.#config.closeOnMaskClick ) {
			backdropHtml += ' tabindex="0"';
		}

		backdropHtml += '></div>';

		this.#dialogNode = createHtmlElement(dialogHtml);
		this.#maskNode = createHtmlElement(backdropHtml);

		if( typeof htmlContent === 'string' ) {
			this.#isPending = false;

			if( (typeof id === 'string') && id !== '' ) {
				this.#dialogNode.setAttribute('id', id);
			}

			if( (typeof htmlClass === 'string') && htmlClass !== '' ) {
				this.#dialogNode.classList.add(htmlClass);
			}

			this.#dialogNode.innerHTML = htmlContent;

			if( this.#config.labelByFirstHeading ) {
				ModalWindow.#setLabelledByAttr(this);
			}
		} else {
			this.#isPending = true;

			if( (typeof id === 'string') && id !== '' ) {
				this.#deferredId = id;
			}

			if( (typeof htmlClass === 'string') && htmlClass !== '' ) {
				this.#deferredClass = htmlClass;
			}

			this.#dialogNode.classList.add(ModalWindow.loadingClass);
		}

		const existingModalElements = document.querySelectorAll(`.${ModalWindow.mainClass}, .${ModalWindow.maskClass}`);

		if( existingModalElements.length === 0 ) {
			if( this.#config.trapFocus ) {
				Array.from(document.body.children).forEach(element => {
					if( element.classList.contains(ModalWindow.inertExemptClass) ) {
						return;
					}

					if( element.inert ) {
						element.dataSet.alreadyInert = true; // prevent making these non-inert when dialog is closed
					} else {
						element.inert = true;
					}
				});
			}

			document.body.append(this.#dialogNode, this.#maskNode);
		} else {
			const mostRecentModal = ModalWindow.getMostRecent();

			if( mostRecentModal !== null ) {
				mostRecentModal.get().inert = true;
				mostRecentModal.getMask().inert = true;
			}

			Array.from(existingModalElements).at(-1).after(this.#dialogNode, this.#maskNode);
		}

		ModalWindow.#store[this.#index] = this;

		if( this.#config.closeOnMaskClick ) {
			this.#maskNode.addEventListener('click', this.remove.bind(this));
		}

		if( this.#config.lockWindowScroll ) {
			const winX = window.scrollX, winY = window.scrollY;

			this.#windowScrollHandler = function () {
				window.scrollTo(winX, winY);
			};

			window.addEventListener('scroll', this.#windowScrollHandler);
		}
	}

	/**
	 * @returns {HTMLElement}
	 */
	get() {
		return this.#dialogNode;
	}

	/**
	 * @returns {HTMLElement}
	 */
	getMask() {
		return this.#maskNode;
	}

	/**
	 * @returns {number}
	 */
	get index() {
		return this.#index;
	}

	/**
	 * @returns {boolean}
	 */
	get isPending() {
		return this.#isPending;
	}

	/**
	 * @param {string} [htmlContent]
	 */
	update(htmlContent = null) {
		this.#dialogNode.innerHTML = '';

		if( typeof htmlContent === 'string' ) {
			this.#isPending = false;

			this.#dialogNode.classList.remove(ModalWindow.loadingClass);

			if( typeof this.#deferredId === 'string' ) {
				this.#dialogNode.setAttribute('id', this.#deferredId);

				delete this.#deferredId;
			}

			if( typeof this.#deferredClass === 'string' ) {
				this.#dialogNode.classList.add(this.#deferredClass);

				delete this.#deferredClass;
			}

			this.#dialogNode.innerHTML = htmlContent;

			if( this.#config.labelByFirstHeading ) {
				ModalWindow.#setLabelledByAttr(this);
			}
		} else if( !this.isPending ) {
			this.#isPending = true;

			this.#dialogNode.classList.add(ModalWindow.loadingClass);

			if( this.#config.labelByFirstHeading ) {
				this.#dialogNode.removeAttribute('aria-labelledby');
			}
		}
	}

	remove() {
		this.#dialogNode.dispatchEvent(new Event('remove'));

		this.#dialogNode.remove();
		this.#maskNode.remove();

		delete ModalWindow.#store[this.#index];

		if( ModalWindow.#layer > 0 ) {
			ModalWindow.#layer--;
		}

		if( typeof this.#windowScrollHandler === 'function' ) {
			window.removeEventListener('scroll', this.#windowScrollHandler);
		}

		if( this.#config.trapFocus ) {
			const existingModalWindows = document.querySelectorAll(`.${ModalWindow.mainClass}`);

			if( existingModalWindows.length === 0 ) {
				Array.from(document.body.children).forEach(element => {
					if( element.classList.contains(ModalWindow.inertExemptClass) ) {
						return;
					}

					if( !element.dataSet.alreadyInert ) {
						this.inert = false; // only do this for elements which were made inert when dialog was opened
					} else {
						delete element.dataSet.alreadyInert;
					}
				});
			} else {
				const mostRecentModal = ModalWindow.getMostRecent();

				if( mostRecentModal !== null ) {
					mostRecentModal.get().inert = false;
					mostRecentModal.getMask().inert = false;
				}
			}
		}
	}
}

// Remove most recent modal window when escape key is pressed
document.addEventListener('keyup', e => {
	if( e.key !== 'Escape' && e.key !== 'Esc' ) {
		return;
	}

	const mostRecentModal = ModalWindow.getMostRecent();

	if( mostRecentModal !== null ) {
		mostRecentModal.remove();
	}
});
