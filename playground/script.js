/** 
 * @typedef {import("../scripts/structure.js").SettingsNotation} SettingsNotation
 */

"use strict";

import { Point2D } from "../scripts/modules/measures.js";
import { ArchiveManager } from "../scripts/modules/storage.js";
import { Board, OutcomeOptions, Settings } from "../scripts/structure.js";

const { trunc, ceil, min, sqrt } = Math;

//#region Controller
/**
 * Represents the controller for the application.
 */
class Controller {
	/**
	 * @param {Readonly<Point2D>} size 
	 * @returns {number}
	 */
	static #getSurface(size) {
		return size.x * size.y;
	}
	/** @type {ArchiveManager<SettingsNotation, Settings>} */
	#managerSettings;
	/** @type {Board} */
	#board;
	/** @type {HTMLElement} */
	#main;
	/** @type {HTMLCanvasElement} */
	#canvas;
	/** @type {Point2D} */
	#scale;
	/**
	 * @returns {void}
	 */
	#resizeCanvas() {
		const size = this.#board.size;
		const main = this.#main;
		main.style.setProperty(`--board-width`, `${size.x}`);
		main.style.setProperty(`--board-height`, `${size.y}`);
		const canvas = this.#canvas;
		const { width, height } = canvas.getBoundingClientRect();
		canvas.width = width;
		canvas.height = height;
		this.#scale = new Point2D(width / size.x, height / size.y);
	}
	/** @type {CanvasRenderingContext2D} */
	#context;
	/**
	 * @returns {void}
	 */
	#resizeContext() {
		const context = this.#context;
		const scale = this.#scale;
		context.font = `900 ${scale.y / 2}px monospace`;
		context.lineWidth = min(scale.x, scale.y) >> 5;
		context.textBaseline = `alphabetic`;
		context.textAlign = `center`;
		context.lineCap = `round`;
	}
	/**
	 * @param {Readonly<Point2D>} position 
	 * @param {CanvasImageSource} image 
	 */
	#drawAt(position, image) {
		const context = this.#context;
		const scale = this.#scale;
		context.drawImage(image,
			ceil(position.x * scale.x),
			ceil(position.y * scale.y),
			ceil(scale.x),
			ceil(scale.y)
		);
	}
	/** @type {HTMLImageElement} */
	#svgField;
	/** @type {HTMLImageElement} */
	#svgDiggedField;
	/** @type {HTMLImageElement} */
	#svgExplodedField;
	/** @type {HTMLImageElement} */
	#svgNeutralizedField;
	/**
	 * @param {Readonly<Point2D>} position 
	 * @returns {CanvasImageSource}
	 * @throws {TypeError} If the x or y coordinate of the position is not an integer.
	 * @throws {RangeError} If the x or y coordinate of the position is out of range.
	 */
	#getBackgroundSourceAt(position) {
		const board = this.#board;
		const state = board.getStateAt(position);
		if (state < 0) return this.#svgField;
		if (state < Board.peakDanger || board.outcome === OutcomeOptions.undefined) return this.#svgDiggedField;
		if (board.outcome === OutcomeOptions.victory) return this.#svgNeutralizedField;
		if (board.outcome === OutcomeOptions.defeat) return this.#svgExplodedField;
		throw new ReferenceError(`Unable to get background source for outcome '${board.outcome}' and state '${state}' at '${position}'`);
	}
	/** @type {HTMLImageElement} */
	#svgUnknown;
	/** @type {HTMLImageElement} */
	#svgFlag;
	/** @type {HTMLImageElement} */
	#svgUndefined;
	/** @type {HTMLImageElement[]} */
	#svgDangers;
	/** @type {HTMLImageElement} */
	#svgMine;
	/**
	 * @param {Readonly<Point2D>} position 
	 * @returns {CanvasImageSource}
	 * @throws {TypeError} If the x or y coordinate of the position is not an integer.
	 * @throws {RangeError} If the x or y coordinate of the position is out of range.
	 */
	#getForegroundSourceAt(position) {
		const state = this.#board.getStateAt(position);
		if (state === -3) return this.#svgUnknown;
		if (state === -2) return this.#svgFlag;
		if (state === -1) return this.#svgUndefined;
		if (0 <= state && state < Board.peakDanger) {
			const source = this.#svgDangers.at(state);
			if (source === undefined) throw new ReferenceError(`Unable to get foreground source state '${state}' at '${position}'`);
			return source;
		}
		if (state === Board.peakDanger) return this.#svgMine;
		throw new ReferenceError(`Unable to get foreground source state '${state}' at '${position}'`);
	}
	/**
	 * @returns {void}
	 */
	#renderBoard() {
		const size = this.#board.size;
		for (let y = 0; y < size.y; y++) {
			for (let x = 0; x < size.x; x++) {
				const position = new Point2D(x, y);
				this.#drawAt(position, this.#getBackgroundSourceAt(position));
				this.#drawAt(position, this.#getForegroundSourceAt(position));
			}
		}
	}
	/**
	 * @returns {void}
	 */
	#renderChanges() {
		const modifications = this.#board.modifications;
		if (modifications.size < 1) return;
		for (const position of modifications.shift()) {
			this.#drawAt(position, this.#getBackgroundSourceAt(position));
			this.#drawAt(position, this.#getForegroundSourceAt(position));
		}
	}
	/**
	 * @returns {Promise<void>}
	 */
	async #renderChangesByColumn() {
		const modifications = this.#board.modifications;
		if (modifications.size < 1) return;
		const area = modifications.shift();
		while (area.size > 0) {
			const anchor = area.peek;
			while (true) {
				const position = area.peek;
				if (position.x !== anchor.x) break;
				this.#drawAt(position, this.#getBackgroundSourceAt(position));
				this.#drawAt(position, this.#getForegroundSourceAt(position));
				area.shift();
				if (area.size < 1) break;
			}
			await Promise.withTimeout(100);
		}
	}
	/**
	 * @param {MouseEvent} event 
	 * @returns {Point2D}
	 */
	#getMouseArea({ clientX, clientY }) {
		const { x, y } = this.#canvas.getBoundingClientRect();
		const scale = this.#scale;
		return new Point2D(
			trunc((clientX - x) / scale.x),
			trunc((clientY - y) / scale.y)
		);
	}
	/**
	 * @param {boolean} already 
	 * @returns {Promise<boolean>}
	 */
	async #isSessionSuspended(already) {
		const board = this.#board;
		const isVictory = (board.outcome === OutcomeOptions.victory);
		const isSuspended = (isVictory || board.outcome === OutcomeOptions.defeat);
		if (isSuspended) {
			if (!already) {
				await this.#renderChangesByColumn();
			}
			let message = `The session${(already ? ` already` : ``)} is ${(isVictory ? `won` : `lost`)}. Start a new one?`;
			if (!already) message = `${(isVictory ? `The board is neutralized.` : `The field blew up.`)}\n${message}`;
			if (await window.confirmAsync(message, isVictory ? `Victory` : `Defeat`)) {
				board.rebuild();
				this.#renderBoard();
			}
		}
		return isSuspended;
	}
	/** @type {HTMLButtonElement} */
	#buttonOpenSettings;
	/** @type {HTMLDialogElement} */
	#dialogSettings;
	/** @type {HTMLInputElement} */
	#inputSizeTextbox;
	/** @type {HTMLInputElement} */
	#inputCountTextbox;
	/** @type {HTMLInputElement} */
	#inputFixRatio;
	// /** @type {HTMLInputElement} */
	// #inputInvertedControl;
	/**
	 * @returns {Promise<void>}
	 */
	async #preload() {
		this.#managerSettings = await ArchiveManager.construct(`${navigator.dataPath}.Settings`, Settings);

		const body = document.body;

		this.#main = body.getElement(HTMLElement, `main`);
		const main = this.#main;

		this.#canvas = main.getElement(HTMLCanvasElement, `canvas#display`);
		const canvas = this.#canvas;

		const context = canvas.getContext(`2d`);
		if (context === null) throw new EvalError(`Unable to get context`);
		this.#context = context;

		this.#buttonOpenSettings = body.getElement(HTMLButtonElement, `button#open-settings`);

		this.#dialogSettings = body.getElement(HTMLDialogElement, `dialog#settings`);
		const dialogSettings = this.#dialogSettings;

		this.#inputSizeTextbox = dialogSettings.getElement(HTMLInputElement, `input#size-textbox`);
		this.#inputCountTextbox = dialogSettings.getElement(HTMLInputElement, `input#count-textbox`);
		this.#inputFixRatio = dialogSettings.getElement(HTMLInputElement, `input#fix-ratio`);

		// this.#inputInvertedControl = dialogSettings.getElement(HTMLInputElement, `input#inverted-control`);
	}
	/**
	 * @returns {Promise<void>}
	 */
	async #run() {
		const managerSettings = this.#managerSettings;
		const settings = managerSettings.content;
		const { boardSize, minesCount } = settings;
		this.#board = new Board(boardSize, minesCount);

		const canvas = this.#canvas;
		this.#resizeCanvas();
		window.addEventListener(`resize`, (event) => this.#resizeCanvas());

		this.#svgField = await document.loadImage(`../resources/icons/background/field.svg`);
		this.#svgDiggedField = await document.loadImage(`../resources/icons/background/digged-field.svg`);
		this.#svgNeutralizedField = await document.loadImage(`../resources/icons/background/neutralized-field.svg`);
		this.#svgExplodedField = await document.loadImage(`../resources/icons/background/exploded-field.svg`);

		this.#svgUnknown = await document.loadImage(`../resources/icons/foreground/unknown.svg`);
		this.#svgFlag = await document.loadImage(`../resources/icons/foreground/flag.svg`);
		this.#svgUndefined = await document.loadImage(`../resources/icons/foreground/undefined.svg`);
		this.#svgDangers = await document.loadImages(Array.sequence(0, Board.peakDanger - 1).map(level => `../resources/icons/foreground/danger-${level}.svg`));
		this.#svgMine = await document.loadImage(`../resources/icons/foreground/mine.svg`);

		this.#resizeContext();
		window.addEventListener(`resize`, (event) => this.#resizeContext());
		this.#renderBoard();
		window.addEventListener(`resize`, (event) => this.#renderBoard());

		canvas.addEventListener(`click`, (event) => window.assert(async () => {
			event.preventDefault();
			if (await this.#isSessionSuspended(true)) return;

			const board = this.#board;
			const position = this.#getMouseArea(event);
			board.markFieldAt(position);
			board.digPerimeterAt(position);
			this.#renderChanges();

			if (await this.#isSessionSuspended(false)) return;
		}));
		canvas.addEventListener(`contextmenu`, (event) => window.assert(async () => {
			event.preventDefault();
			if (await this.#isSessionSuspended(true)) return;

			const board = this.#board;
			const position = this.#getMouseArea(event);
			board.digFieldAt(position);
			this.#renderChanges();

			if (await this.#isSessionSuspended(false)) return;
		}));

		const buttonOpenSettings = this.#buttonOpenSettings;
		const dialogSettings = this.#dialogSettings;
		buttonOpenSettings.addEventListener(`click`, (event) => {
			dialogSettings.showModal();
		});
		dialogSettings.addEventListener(`click`, (event) => {
			if (event.target !== dialogSettings) return;
			dialogSettings.close();
		});

		const board = this.#board;
		const inputSizeTextbox = this.#inputSizeTextbox;
		inputSizeTextbox.value = `${board.size}`;
		inputSizeTextbox.addEventListener(`change`, async (event) => {
			try {
				const size = Point2D.parse(inputSizeTextbox.value);
				const count = (settings.fixRatio
					? trunc(board.count * Controller.#getSurface(size) / Controller.#getSurface(board.size))
					: board.count
				);
				board.resize(size, count);
				this.#resizeCanvas();
				this.#resizeContext();
				this.#renderBoard();
				settings.resize(size, count);
			} catch (error) {
				await window.warn(Error.generate(error).message);
			} finally {
				inputSizeTextbox.value = `${board.size}`;
				inputCountTextbox.value = `${board.count}`;
			}
		});

		const inputCountTextbox = this.#inputCountTextbox;
		inputCountTextbox.value = `${board.count}`;
		inputCountTextbox.addEventListener(`change`, async (event) => {
			try {
				const count = Number(inputCountTextbox.value);
				const size = (settings.fixRatio
					? board.size.map(metric => trunc(metric * sqrt(count / board.count)))
					: board.size
				);
				board.resize(size, count);
				this.#resizeCanvas();
				this.#resizeContext();
				this.#renderBoard();
				settings.resize(size, count);
			} catch (error) {
				await window.warn(Error.generate(error).message);
			} finally {
				inputSizeTextbox.value = `${board.size}`;
				inputCountTextbox.value = `${board.count}`;
			}
		});

		const inputFixRatio = this.#inputFixRatio;
		inputFixRatio.checked = settings.fixRatio;
		inputFixRatio.addEventListener(`change`, (event) => {
			settings.fixRatio = inputFixRatio.checked;
		});

		// const inputToggleInvertedControl = this.#inputInvertedControl;
		// inputToggleInvertedControl.checked = settings.invertedControl;
		// inputToggleInvertedControl.addEventListener(`change`, (event) => {
		// 	settings.invertedControl = inputToggleInvertedControl.checked;
		// });
	}
	/**
	 * @returns {Promise<void>}
	 */
	async main() {
		await this.#preload();
		await window.load(this.#run());
	}
}
const controller = new Controller();
await window.assert(() => controller.main());
//#endregion
