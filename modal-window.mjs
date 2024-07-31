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

	/**
	 * A generic utility method - similar to Element.closest() except that it stops searching
	 * once it reaches the element on which EventTarget.addEventListener() was called.
	 *
	 * Inspired by the `passedThrough()` function of this solution:
	 * {@link https://gist.github.com/evenicoulddoit/9769f78e9a6f359c4561}
	 *
	 * @param {Event} event
	 * @param {string} selector
	 */
	static #findDelegatedTarget(event, selector) {
		if( typeof event !== 'object' || !(event instanceof Event) ) {
			throw new TypeError('The "event" argument must be an instance of Event.');
		}

		if( !event.target ) {
			return null;
		}

		let targetCandidate = event.target;

		do {
			if( targetCandidate.matches(selector) ) {
				return targetCandidate;
			} else {
				targetCandidate = targetCandidate.parentNode;
			}
		} while( targetCandidate !== null && targetCandidate !== event.currentTarget && targetCandidate !== document.body );

		return null;
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
					if( element instanceof HTMLElement && !element.classList.contains(ModalWindow.inertExemptClass) ) {
						if( element.inert ) {
							element.dataset.alreadyInert = '1'; // prevent making these non-inert when dialog is closed
						} else {
							element.inert = true;
						}
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

				this.#deferredId = undefined;
			}

			if( typeof this.#deferredClass === 'string' ) {
				this.#dialogNode.classList.add(this.#deferredClass);

				this.#deferredClass = undefined;
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

	/**
	 * Inspired by custom `addEventListener()` function from {@link https://youmightnotneedjquery.com/#on}.
	 *
	 * @param {string} eventName
	 * @param {string} selector
	 * @param {Function} handler
	 */
	addDelegatedEventListener(eventName, selector, handler) {
		const handlerWrapper = event => {
			const element = ModalWindow.#findDelegatedTarget(event, selector);

			if( element !== null ) {
				handler.call(element, event);
			}
		};

		this.#dialogNode.addEventListener(eventName, handlerWrapper);

		return handlerWrapper;
	}

	/**
	 * A shortcut version of `addDelegatedEventListener()` specifically for triggering the `remove()`
	 * method of this instance of `ModalWindow`; uses the "click" event by default.
	 *
	 * @param {string} eventNameOrSelector
	 * @param {string} [selector]
	 */
	addDelegatedDialogRemover(eventNameOrSelector, selector) {
		let eventName;

		if( typeof selector === 'undefined' ) {
			eventName = 'click';
			selector = eventNameOrSelector;
		} else {
			eventName = eventNameOrSelector;
		}

		this.#dialogNode.addEventListener(eventName, event => {
			const element = ModalWindow.#findDelegatedTarget(event, selector);

			if( element !== null ) {
				this.remove.call(this);
			}
		});
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
					if( element instanceof HTMLElement && !element.classList.contains(ModalWindow.inertExemptClass) ) {
						if( element.dataset.alreadyInert === undefined ) {
							element.inert = false; // only do this for elements which were made inert when dialog was opened
						} else {
							delete element.dataset.alreadyInert;
						}
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
